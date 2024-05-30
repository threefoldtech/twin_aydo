import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IPostComment, IPostContainerDTO } from 'custom-types/post.type';

import { AuthGuard } from '../../guards/auth.guard';
import { CreatePostDTO } from './dtos/request/create-post.dto';
import { GetPostQueryDto } from './dtos/request/get-post-query.dto';
import { GetPostsQueryDto } from './dtos/request/get-posts-query.dto';
import { LikePostDTO } from './dtos/request/like-post.dto';
import { TypingDTO } from './dtos/request/typing.dto';
import { PostService } from './post.service';
import { LikeCommentDTO } from './dtos/request/like-comment.dto';
import { DeleteCommentDTO } from './dtos/delete-comment.dto';

@Controller('posts')
export class PostController {
    constructor(private readonly _postService: PostService) {}

    @Get(':username')
    async getPosts(
        @Param() { username }: GetPostsQueryDto,
        @Query('offset') offset = 0,
        @Query('count') count = 50,
        @Query('external') external = false
    ): Promise<IPostContainerDTO[]> {
        return await this._postService.getPosts({ offset, count, username, external });
    }

    @Get('/:owner/:postId')
    async getPost(@Param() { owner, postId }: GetPostQueryDto): Promise<IPostContainerDTO> {
        return await this._postService.getPost({ ownerLocation: owner, postId });
    }

    @Post()
    @UseGuards(AuthGuard)
    async createPost(@Body() createPostDTO: any /* CreatePostDTO */): Promise<IPostContainerDTO> {
        console.log(createPostDTO);

        return await this._postService.createPost(createPostDTO);
    }

    @Delete(':postId')
    @UseGuards(AuthGuard)
    async deletePost(@Param() { postId }: GetPostQueryDto): Promise<string> {
        return await this._postService.deletePost({ postId });
    }

    @Put('like/:postId')
    async likePost(
        @Param() { postId }: GetPostQueryDto,
        @Body() likePostDTO: LikePostDTO
    ): Promise<{ status: string }> {
        return await this._postService.likePost({ postId, likePostDTO });
    }

    @Put('typing')
    async handleTyping(@Body() typingDTO: TypingDTO): Promise<{ post: string; user: string }> {
        return await this._postService.handleTyping(typingDTO);
    }

    @Post('someone-is-typing')
    async handleSendSomeoneIsTyping(@Body() typingDTO: TypingDTO): Promise<boolean> {
        return await this._postService.handleSendSomeoneIsTyping(typingDTO);
    }

    @Put('comment/react/:postId')
    async commentOnPost(
        @Param() { postId }: GetPostQueryDto,
        @Body() commentDTO: IPostComment
    ): Promise<{ status: string }> {
        return await this._postService.commentOnPost({ postId, commentDTO });
    }

    @Put('comment/like')
    async likeComment(@Body() likeCommentDTO: LikeCommentDTO) {
        return await this._postService.likeComment(likeCommentDTO);
    }

    @Delete('comment/delete')
    async deleteComment(@Body() deleteCommentDTO: DeleteCommentDTO) {
        return await this._postService.deleteComment(deleteCommentDTO);
    }
}
