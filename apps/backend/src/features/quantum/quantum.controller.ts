import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    NotFoundException,
    Param,
    Post,
    Put,
    Query,
    Req,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { join } from 'path';
import syncRequest from 'sync-request';

import { AuthGuard } from '../../guards/auth.guard';
import { ApiService } from '../api/api.service';
import { CreateDirectoryDTO } from '../file/dtos/directory.dto';
import { DirectoryInfoDTO } from '../file/dtos/directory-info.dto';
import { PathInfoDTO } from '../file/dtos/path-info.dto';
import { FileService } from '../file/file.service';
import { KeyService } from '../key/key.service';
import { MoveFileDTO } from './dtos/move-file.dto';
import { RenameFileDTO } from './dtos/rename-file.dto';
import { ShareFileRequesDTO } from './dtos/share-file.dto';
import { SharePermissionType } from './enums/share-permission-type.enum';
import { IFileShare } from './interfaces/file-share.interface';
import { IEditFileResponse } from './interfaces/only-office-reponse.interface';
import { QuantumService } from './quantum.service';
import { LocationService } from '../location/location.service';

@Controller('quantum')
export class QuantumController {
    private storageDir = '';

    constructor(
        private readonly _configService: ConfigService,
        private readonly _quantumService: QuantumService,
        private readonly _fileService: FileService,
        private readonly _keyService: KeyService,
        private readonly _apiService: ApiService,
        private readonly _locationService: LocationService
    ) {
        this.storageDir = `${this._configService.get<string>('baseDir')}storage`;
    }

    @Get('dir/content')
    @UseGuards(AuthGuard)
    async getDirectoryContent(@Query('path') path: string): Promise<PathInfoDTO[]> {
        const actualPath = path === '/' ? this.storageDir : path;
        return await this._quantumService.getDirectoryContent({ path: actualPath });
    }

    @Get('dir/info')
    @UseGuards(AuthGuard)
    async getDirectoryInfo(@Query('path') path: string): Promise<PathInfoDTO> {
        const actualPath = path === '/' ? this.storageDir : path;
        return await this._quantumService.getDirectoryInfo({ path: actualPath });
    }

    @Get('attachment/download')
    @UseGuards(AuthGuard)
    async downloadAttachment(@Query() params: { owner: string; path: string; to: string; messageId: string }) {
        //todo: save downloaded file in attachments folder
        return 'OK';
        // const { path, owner, to, messageId } = params;
        // const userId = this._configService.get('userId');
        //
        // const location = new URL(path).hostname.replace('[', '').replace(']', '');
        //
        // const msg: MessageDTO<StringMessageType> = {
        //     id: uuidv4(),
        //     body: path,
        //     from: userId,
        //     to: owner,
        //     timeStamp: new Date(),
        //     type: MessageTypes.DOWNLOAD_ATTACHMENT,
        //     replies: [],
        //     signatures: [],
        //     subject: null,
        //     chatId: to,
        // };
        //
        // let result: Buffer | undefined = undefined;
        //
        // if (owner === userId) {
        //     const path = `/appdata/chats/${to}/files/${messageId}`;
        //     const folder = fs.readdirSync(path);
        //     if (!folder || folder.length === 0) return 'File does not exist';
        //     result = fs.readFileSync(path + '/' + folder[0]);
        // }
        //
        // if (owner !== userId) {
        //     const parsedmsg = parseMessage(msg);
        //     await this._keyService.appendSignatureToMessage({ message: parsedmsg });
        //     result = (
        //         await this._apiService.sendMessageToApi({
        //             location,
        //             message: parsedmsg,
        //             responseType: 'arraybuffer',
        //         })
        //     ).data;
        // }
        //
        // const mimetype = (await fromBuffer(Buffer.from(JSON.stringify(result), 'utf8')))?.mime || null;
        // const file: UploadedFile = {
        //     name: null,
        //     data: Buffer.from(result),
        //     size: null,
        //     encoding: null,
        //     tempFilePath: null,
        //     truncated: null,
        //     mimetype,
        //     md5: null,
        //     mv: null,
        // };
        //
        // this._quantumService.createFileWithRetry({ fromPath, toPath, name });
        // await saveFileWithRetry(
        //     new Path(<string>owner + '/' + path.split('/').pop(), '/appdata/attachments/'),
        //     file,
        //     0,
        //     '/appdata/attachments/'
        // );
        //
        // return 'OK';
    }

    @Get('file/info')
    @UseGuards(AuthGuard)
    async getFileInfo(@Query() params: { path: string; attachments: boolean; location?: string }) {
        const { path, attachments, location } = params;

        const myLocation = await this._locationService.getOwnLocation();
        if (location && location !== myLocation) {
            return await this._apiService.getExternalFileInfo({ path, attachments, location });
        }
        // const parsedParams = Buffer.from(JSON.stringify(params), 'base64').toString('utf8');
        // const paramsObj = JSON.parse(parsedParams);

        // console.log(paramsObj);

        // let actualPath = path;
        // if (params) {
        //     const { shareId, token } = paramsObj as { shareId: string; token: string };
        //     const payload = await this._quantumService.verifyQuantumJWT({ token });
        //     if (payload.permissions.indexOf(SharePermissionType.READ) < 0)
        //         throw new UnauthorizedException(`you do not have the premission to read this file`);
        //     actualPath = await this._quantumService.getSharePath({ shareId });
        // }

        // actualPath = attachments ? join(actualPath, '/appdata/attachments') : actualPath;

        return {
            ...(await this._quantumService.getFileInfo({ path })),
            key: this._quantumService.getQuantumFileToken({ writable: true, path }),
            readToken: await this._quantumService.generateQuantumJWT({
                payload: { file: path, permissions: [SharePermissionType.READ] },
                exp: 5 * 60,
            }),
            writeToken: await this._quantumService.generateQuantumJWT({
                payload: { file: path, permissions: [SharePermissionType.WRITE, SharePermissionType.READ] },
                exp: 24 * 60 * 60,
            }),
        };
    }

    @Get('file/internal')
    @HttpCode(200)
    async getQuantumFile(@Req() req: Request, @Query() { path, token }: { path: string; token: string }) {
        if (!token) throw new UnauthorizedException('no token provided');

        // TODO: handle blocked tokens

        // TODO: fix
        // const payload = await this._quantumService.verifyQuantumJWT({ token });
        // if (payload.permissions.indexOf(SharePermissionType.READ) < 0 || payload.file !== path)
        //     throw new UnauthorizedException(`you do not have the premission to read this file`);

        // TODO: handle attachments
        const fileBuffer = this._fileService.readFile({ path });
        const fileStream = await this._fileService.getFileStream({ file: fileBuffer });
        const fileInfo = await this._quantumService.getFileInfo({ path });
        if (req.res) req.res.setHeader(`Content-Disposition`, `attachment; filename=${fileInfo.fullName}`);

        fileStream.pipe(req.res);

        await new Promise(resolve => {
            fileStream.on('end', () => {
                resolve(req.res.end());
            });
        });
    }

    //route for editing in onlyOffice
    @Post('file/internal')
    @HttpCode(200)
    async editQuantumFile(
        @Body() editFileResponse: IEditFileResponse,
        @Query('token') token: string,
        @Query('path') path: string
    ) {
        if (!token) throw new UnauthorizedException('no token provided');

        if (editFileResponse.status !== 2 && editFileResponse.status !== 6)
            return {
                error: 0,
            };

        // TODO: handle blocked tokens

        // const payload = await this._quantumService.verifyQuantumJWT({ token });

        // if (payload.permissions.indexOf(SharePermissionType.WRITE) < 0)
        //     throw new UnauthorizedException(`you do not have the permission to edit this file`);

        if (!path) throw new NotFoundException('no path provided');

        if (editFileResponse.content) {
            const { location, content } = editFileResponse;
            path = Buffer.from(path, 'base64').toString('binary');

            const myLocation = await this._locationService.getOwnLocation();
            if (location !== myLocation) {
                await this._apiService.editFile({ path, content, location, token });
                return;
            }

            if (!this._fileService.exists({ path })) return;

            return this._fileService.writeFile({ path, content });
        }

        if (!editFileResponse?.url) throw new NotFoundException('no url provided');

        const url = new URL(editFileResponse.url);

        const hostName = this._configService.get<string>('documentServerLocation');

        url.hostname = hostName;
        url.protocol = 'https:';
        const fileResponse = syncRequest('GET', url);
        const fileBuffer = <Buffer>fileResponse.body;
        await this._quantumService.writeFile({ path, file: fileBuffer });
        return {
            error: 0,
        };
    }

    @Delete('file/internal')
    @UseGuards(AuthGuard)
    async deleteFile(@Query('path') path: string) {
        path = Buffer.from(path, 'base64').toString('binary');
        return this._quantumService.deleteFile({ path });
    }

    @Get('search')
    @UseGuards(AuthGuard)
    async search(@Query('search') search: string, @Query('dir') dir: string): Promise<PathInfoDTO[]> {
        const path = dir === '/' ? this.storageDir : dir;
        return await this._quantumService.search({ search, dir: path });
    }

    @Get('share/info')
    async getShareFileAccessDetails(@Query() params: { shareId: string; userId: string; path: string }) {
        const { shareId, userId, path } = params;
        const share = await this._quantumService.getShareById({ id: shareId });
        const userPermissions = await this._quantumService.getSharePermissionsByUser({ shareId, userId });
        if (userPermissions.length < 1)
            throw new UnauthorizedException('you do not have the premission to read this file');

        let actualPath = share.path;
        if (path !== actualPath) actualPath = join(path, actualPath);

        const userCanWrite = !!userPermissions.find(x => x === SharePermissionType.WRITE);

        return {
            ...(await this._quantumService.getFileInfo({ path: actualPath })),
            key: this._quantumService.getQuantumFileToken({ writable: userCanWrite, path: actualPath }),
            readToken: await this._quantumService.generateQuantumJWT({
                payload: { file: actualPath, permissions: [SharePermissionType.READ] },
                exp: 5 * 60,
            }),
            writeToken: userCanWrite
                ? await this._quantumService.generateQuantumJWT({
                      payload: { file: actualPath, permissions: [SharePermissionType.WRITE, SharePermissionType.READ] },
                      exp: 24 * 60 * 60,
                  })
                : undefined,
        };
    }

    @Get('shares/shared-with-me')
    @UseGuards(AuthGuard)
    async getSharedWithMe(): Promise<IFileShare[]> {
        return await this._quantumService.getSharedWithMe();
    }

    @Get('share')
    @UseGuards(AuthGuard)
    async getShareById(@Query('id') id: string): Promise<IFileShare> {
        return (await this._quantumService.getShareById({ id }))?.toJSON();
    }

    @Delete('share/:shareId/:chatId')
    async deleteShare(@Param('shareId') shareId: string, @Param('chatId') chatId: string) {
        const share = await this._quantumService.getShareById({ id: shareId });
        return await this._quantumService.handleIncomingDeleteShare({ share, chatId });
    }

    @Get('share/path')
    @UseGuards(AuthGuard)
    async getShareByPath(@Query('path') path: string): Promise<IFileShare> {
        path = Buffer.from(path, 'base64').toString('binary');
        return (await this._quantumService.getShareByPath({ path }))?.toJSON();
    }

    @Post('share/permissions')
    @UseGuards(AuthGuard)
    async updateSharePermissions(@Body() { chatId, path }: { chatId: string; path: string }) {
        path = Buffer.from(path, 'base64').toString('binary');
        await this._quantumService.filterSharePermissions({ chatId, path });
    }

    @Post('dir')
    @UseGuards(AuthGuard)
    async createDirectory(@Body() { path, name }: CreateDirectoryDTO): Promise<DirectoryInfoDTO> {
        const actualPath = path === '/' ? join(this.storageDir, name) : join(path, name);
        const details = await this._quantumService.createDirectoryWithRetry({ path: actualPath });
        return {
            isFile: false,
            name: details.name,
            isDirectory: true,
        } as DirectoryInfoDTO;
    }

    @Post('move-files')
    @UseGuards(AuthGuard)
    moveFiles(@Body() { paths, destination }: MoveFileDTO): boolean {
        paths.map(path => {
            const name = path.split('/').pop();
            const actualPath = path === '/' ? join(this.storageDir, name) : path;
            const actualDestination = destination === '/' ? this.storageDir : destination;
            this._quantumService.createFileWithRetry({
                fromPath: actualPath,
                toPath: actualDestination,
                name,
            });
        });
        return true;
    }

    @Post('files/copy')
    @UseGuards(AuthGuard)
    copyFiles(@Body() { paths, destination }: MoveFileDTO): boolean {
        paths.map(path => {
            const name = path.split('/').pop();
            const actualPath = path === '/' ? join(this.storageDir, name) : path;
            const actualDestination = destination === '/' ? this.storageDir : destination;
            this._quantumService.copyFileWithRetry({
                fromPath: actualPath,
                toPath: actualDestination,
                name,
            });
        });
        return true;
    }

    @Post('share')
    @UseGuards(AuthGuard)
    async shareFile(@Body() shareFileDTO: ShareFileRequesDTO) {
        return await this._quantumService.shareFile(shareFileDTO);
    }

    @Put('rename')
    @UseGuards(AuthGuard)
    async renameFileOrDirectory(@Body() { from, to }: RenameFileDTO): Promise<void> {
        const actualPath = to.includes('appdata') ? to : join(this.storageDir, to);
        return await this._quantumService.renameFileOrDirectory({ from, to: actualPath });
    }
}
