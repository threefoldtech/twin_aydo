import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IPostComment, IPostContainerDTO } from 'custom-types/post.type';

import { ApiService } from '../api/api.service';
import { BlockedContactService } from '../blocked-contact/blocked-contact.service';
import { ContactService } from '../contact/contact.service';
import { LocationService } from '../location/location.service';
import { UserGateway } from '../user/user.gateway';
import { UserService } from '../user/user.service';
import { CreatePostDTO } from './dtos/request/create-post.dto';
import { LikePostDTO } from './dtos/request/like-post.dto';
import { TypingDTO } from './dtos/request/typing.dto';
import { stringifyLikes, stringifyReplies } from './models/post.model';
import { PostGateway } from './post.gateway';
import { PostRedisRepository } from './repositories/post-redis.repository';
import { LikeCommentDTO } from './dtos/request/like-comment.dto';
import { DeleteCommentDTO } from './dtos/delete-comment.dto';
import { bypassAuth } from '../../constants';

@Injectable()
export class PostService {
    private ownLocation = '';
    private user: string | null = null;

    constructor(
        private readonly _postRepo: PostRedisRepository,
        private readonly _locationService: LocationService,
        private readonly _configService: ConfigService,
        private readonly _apiService: ApiService,
        private readonly _contactService: ContactService,
        private readonly _blockedContactService: BlockedContactService,
        private readonly _userService: UserService,
        private readonly _userGateway: UserGateway,
        private readonly _postGateway: PostGateway
    ) {
        this.user = this._configService.get<string>('userId');
    }

    /**
     * Creates a new post.
     * @param {CreatePostDTO} createPostDTO - Post creation data.
     * @return {IPostContainerDTO} - The created post.
     */
    async createPost({
        id,
        body,
        isGroupPost,
        type,
        images,
        video,
        replies,
        signatures,
    }: CreatePostDTO): Promise<IPostContainerDTO> {
        if (!this.ownLocation) this.ownLocation = (await this._locationService.getOwnLocation()) as string;
        try {
            const postContainer: IPostContainerDTO = {
                id,
                post: {
                    id,
                    body,
                    createdOn: new Date(),
                    lastModified: new Date(),
                    isGroupPost,
                    type,
                    images: images || [],
                    video: video || '',
                    replies,
                    signatures,
                },
                owner: {
                    id: this.user,
                    location: this.ownLocation,
                },
                ownerId: this.user,
                images: images || [],
                video: video || '',
                replies,
                likes: [],
            };
            return (await this._postRepo.createPost(postContainer)).toJSON();
        } catch (error) {
            throw new BadRequestException(`unable to create post: ${error}`);
        }
    }

    /**
     * Gets all posts.
     * @param {Object} obj - Object.
     * @param {number} obj.offset - Pagination offset.
     * @param {number} obj.count - Pagination count.
     * @param {string} obj.username - User to get posts from.
     * @return {IPostContainerDTO[]} - Found posts.
     */
    async getPosts({
        offset,
        count,
        username,
        external,
    }: {
        offset: number;
        count: number;
        username: string;
        external: boolean;
    }): Promise<IPostContainerDTO[]> {
        const posts: IPostContainerDTO[] = [];
        try {
            // get contacts posts
            if (!external) {
                const contacts = (await this._contactService.getUnblockedContacts())
                    .filter(c => c.accepted)
                    .filter(c => !c.containerOffline);

                await Promise.all(
                    contacts.map(async contact => {
                        const data = await this._apiService.getExternalPosts({
                            location: contact.location,
                            userId: contact.id,
                        });
                        if (!data) {
                            contact.containerOffline = true;
                            return await this._contactService.updateContact(contact);
                        }
                        posts.push(...data);
                    })
                );
            }
            // get own posts
            const data = (await this._postRepo.getPosts({ offset, count, username })).map(post => post.toJSON());
            posts.push(...data);
        } catch (error) {
            return [];
        }

        return posts;
    }

    /**
     * Gets a single post.
     * @param {Object} obj - Object.
     * @param {string} obj.ownerLocation - Location to get post from.
     * @param {string} obj.postId - PostId.
     * @return {IPostContainerDTO} - Found post.
     */
    async getPost({ ownerLocation, postId }: { ownerLocation: string; postId: string }): Promise<IPostContainerDTO> {
        if (!this.ownLocation) this.ownLocation = (await this._locationService.getOwnLocation()) as string;

        if (ownerLocation === this.ownLocation)
            try {
                return (await this._postRepo.getPost({ id: postId }))?.toJSON();
            } catch (error) {
                throw new BadRequestException(`unable to get post: ${error}`);
            }
        return await this._apiService.getExternalPost({ location: ownerLocation, postId });
    }

    /**
     * Likes or dislikes a post.
     * @param {Object} obj - Object.
     * @param {string} obj.postId - PostId.
     * @param {LikePostDTO} obj.likePostDTO - Like post data.
     * @return {{status: string}} - Liked or unliked.
     */
    async likePost({ postId, likePostDTO }: { postId: string; likePostDTO: LikePostDTO }): Promise<{ status: string }> {
        const { likerId: id, likerLocation: location, owner } = likePostDTO;

        if (await this._blockedContactService.isBlocked({ userId: id })) throw new BadRequestException('blocked');

        if (!this.ownLocation) this.ownLocation = (await this._locationService.getOwnLocation()) as string;

        if (owner !== this.ownLocation)
            return await this._apiService.likeExternalPost({ location: owner, likePostDTO, postId });

        const post = await this._postRepo.getPost({ id: postId });
        const likes = post.parseLikes();

        const res = {
            status: likes.some(l => l.location === location && l.id === id) ? 'unliked' : 'liked',
        };

        if (res.status == 'unliked') likes.splice(likes.indexOf({ id, location }), 1);
        else likes.push({ id, location });

        post.likes = stringifyLikes(likes);
        try {
            await this._postRepo.updatePost(post);
            return res;
        } catch (error) {
            throw new BadRequestException(`unable to like post: ${error}`);
        }
    }

    /**
     * Deletes a post.
     * @param {Object} obj - Object.
     * @param {string} obj.postId - PostId to delete.
     * @return {string} - Deleted post Id.
     */
    async deletePost({ postId }: { postId: string }): Promise<string> {
        try {
            const post = await this._postRepo.getPost({ id: postId });

            if (post?.ownerId === this.user) {
                await this._postRepo.deletePost({ id: post.entityId });
                const contacts = await this._contactService.getContacts();
                for (const contact of contacts) {
                    this._apiService.deletePost({ location: contact.location, postId });
                }
            }

            this._postGateway.emitMessageToConnectedClients('post_deleted', postId);
            return postId;
        } catch (error) {
            throw new BadRequestException(`unable to delete post: ${error}`);
        }
    }

    /**
     * Handles typing event when a user is writing a comment.
     * @param {TypingDTO} typingDTO - Typing data.
     * @return {{post: string; user: string}} - Post on which is being commented on and user id of who is commenting.
     */
    async handleTyping(typingDTO: TypingDTO): Promise<{ post: string; user: string }> {
        const { location, postId, userId } = typingDTO;

        if (!this.ownLocation) this.ownLocation = (await this._locationService.getOwnLocation()) as string;

        if (location !== this.ownLocation) return this._apiService.handleTyping({ location, typingDTO });

        const contacts = await this._contactService.getUnblockedContacts();
        Promise.all(
            contacts.map(async contact => {
                await this._apiService.sendSomeoneIsTyping({ location: contact.location, typingDTO });
            })
        );

        return { post: postId, user: userId };
    }

    /**
     * Handles typing event when someone else is writing a comment.
     * @param {TypingDTO} typingDTO - Typing data.
     * @return {boolean} - Success or not.
     */
    async handleSendSomeoneIsTyping(typingDTO: TypingDTO): Promise<boolean> {
        const { postId, userId } = typingDTO;
        this._userGateway.emitMessageToConnectedClients('post_typing', { post: postId, user: userId });
        return true;
    }

    /**
     * Comments on a post
     * @param {Object} obj - Object.
     * @param {string} obj.postId - PostId.
     * @param {IPostComment} obj.commentDTO - Comment data.
     * @return {{status: string}} - Commented status.
     */
    async commentOnPost({
        postId,
        commentDTO,
    }: {
        postId: string;
        commentDTO: IPostComment;
    }): Promise<{ status: string }> {
        const { post, replyTo, isReplyToComment, owner } = commentDTO;

        if (!this.ownLocation) this.ownLocation = (await this._locationService.getOwnLocation()) as string;

        if (post.owner.location !== this.ownLocation) {
            if (owner.id !== this.user) throw new ForbiddenException('cannot comment as someone else');
            return await this._apiService.commentOnExternalPost({ location: post.owner.location, commentDTO });
        }

        try {
            const dbPost = await this._postRepo.getPost({ id: postId });
            const comments = dbPost.parseReplies();
            if (isReplyToComment) {
                const commentIdx = comments.findIndex(r => r.id === replyTo);
                if (commentIdx < 0) throw new BadRequestException('comment not found');
                comments[commentIdx].replies.push(commentDTO);
            } else comments.push(commentDTO);
            dbPost.replies = stringifyReplies(comments);
            await this._postRepo.updatePost(dbPost);
        } catch (error) {
            throw new BadRequestException(`unable to comment on post: ${error}`);
        }

        return { status: 'commented' };
    }

    async likeComment(likeCommentDTO: LikeCommentDTO): Promise<{ status: string }> {
        try {
            const myLocation = await this._locationService.getOwnLocation();
            if (likeCommentDTO.owner !== myLocation) {
                const res = await this._apiService.likeExternalComment({
                    location: likeCommentDTO.owner,
                    likeCommentDTO,
                });
                return res.data;
            }
            const post = await this._postRepo.getPost({ id: likeCommentDTO.postId });
            const comment = this.findComment(post.parseReplies(), likeCommentDTO.commentId);
            if (!comment) throw new BadRequestException('comment not found');

            for (const [i, like] of comment.likes.entries()) {
                if (like.location !== likeCommentDTO.likerLocation) continue;
                comment.likes.splice(i, 1);
                const changedComments = this.replaceComment(post.parseReplies(), comment);
                post.replies = stringifyReplies(changedComments);
                await this._postRepo.updatePost(post);
                return { status: 'unliked' };
            }

            comment.likes.push({ id: likeCommentDTO.likerId, location: likeCommentDTO.likerLocation });
            const changedComments = this.replaceComment(post.parseReplies(), comment);
            post.replies = stringifyReplies(changedComments);
            await this._postRepo.updatePost(post);
            return { status: 'liked' };
        } catch (error) {
            throw new BadRequestException(`unable to like comment: ${error}`);
        }
    }

    async deleteComment(deleteCommentDTO: DeleteCommentDTO): Promise<{ status: string }> {
        try {
            const myLocation = await this._locationService.getOwnLocation();
            if (deleteCommentDTO.ownerLocation !== myLocation) {
                return await this._apiService.deleteExternalComment({ deleteCommentDTO });
            }

            const post = await this._postRepo.getPost({ id: deleteCommentDTO.postId });
            const comment = this.findComment(post.parseReplies(), deleteCommentDTO.commentId);
            if (!comment) throw new BadRequestException('comment not found');
            const owner = post.parsePostOwner();

            if (comment.owner.id !== this.user && this.user !== owner.id) {
                throw new ForbiddenException('cannot delete comment as someone else if you are not the owner.');
            }

            const changedComments = this.removeComment(post.parseReplies(), comment);
            post.replies = stringifyReplies(changedComments);
            await this._postRepo.updatePost(post);
            return { status: 'deleted' };
        } catch (error) {
            throw new BadRequestException(`unable to delete comment: ${error}`);
        }
    }

    private findComment(comments: IPostComment[], commentId: string): IPostComment | undefined {
        for (const comment of comments) {
            if (comment.id === commentId) return comment;
            if (comment.replies.length === 0) continue;
            const foundComment = this.findComment(comment.replies, commentId);
            if (foundComment) return foundComment;
        }
    }

    private replaceComment(comments: IPostComment[], newComment: IPostComment): IPostComment[] {
        for (const [i, comment] of comments.entries()) {
            if (comment.id === newComment.id) {
                comments.splice(i, 1, newComment);
                return comments;
            }
            if (comment.replies.length === 0) continue;

            const changedComments = this.replaceComment(comment.replies, newComment);
            if (!changedComments) continue;
            comment.replies = changedComments;
            return comments;
        }
    }

    private removeComment(comments: IPostComment[], commentToRemove: IPostComment): IPostComment[] {
        for (const [i, comment] of comments.entries()) {
            if (comment.id === commentToRemove.id) {
                comments.splice(i, 1);
                return comments;
            }
            if (comment.replies.length === 0) continue;

            const changedComments = this.removeComment(comment.replies, commentToRemove);
            if (!changedComments) continue;
            comment.replies = changedComments;
            return comments;
        }
    }
}
