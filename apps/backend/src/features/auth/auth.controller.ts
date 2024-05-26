import {
    BadRequestException,
    Controller,
    Get,
    Post,
    Query,
    Redirect,
    Req,
    Res,
    Session,
    UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { AuthGuard } from '../../guards/auth.guard';
import { LocationService } from '../location/location.service';
import { YggdrasilService } from '../yggdrasil/yggdrasil.service';
import { AuthService } from './auth.service';
import { SignInQuery } from './query/sign-in.query';
import { ProfileData } from './interfaces/auth.interfaces';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly _authService: AuthService,
        private readonly _yggdrasilService: YggdrasilService,
        private readonly _locationService: LocationService
    ) {}

    @Get('authenticated')
    @UseGuards(AuthGuard)
    async isLoggedIn() {
        // Can just return true, AuthGuard will make sure user is authenticated.
        return {
            status: true,
        };
    }

    @Get('signIn')
    @Redirect()
    async signIn(@Req() req: Request, @Session() session: Record<string, unknown>, @Query() query: SignInQuery) {
        const appLogin = await this._authService.getAppLogin(req.hostname, `/api/v2/auth/callback`);
        session.state = appLogin.loginState;
        const loginUrl = `${appLogin.loginUrl}&username=${query.username}`;
        return { url: loginUrl };
    }

    @Post('signOut')
    @UseGuards(AuthGuard)
    async signOut(@Req() req: Request) {
        const promise = new Promise<void>((resolve, reject) => {
            req.session.cookie.maxAge = 0;
            req.session.destroy(err => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });

        try {
            await promise;
            return {
                success: true,
            };
        } catch (err) {
            return {
                success: false,
            };
        }
    }

    @Get('callback')
    async authCallback(@Req() req: Request, @Res() res: Response) {
        console.log('A');
        const redirectUrl = new URL(`${req.protocol}://${req.get('host')}${req.originalUrl}`);
        console.log('redirectUrl', redirectUrl);

        let profileData: ProfileData;

        try {
            profileData = await this._authService.getProfileData({ redirectUrl, sessionState: req.session.state });
            console.log('profileData', profileData);
        } catch (e) {
            res.redirect('/error?reason=wrongUser');
        }

        delete req.session.state;

        if (!this._yggdrasilService.isInitialised()) console.log('Setting up Ygg');
        await this._yggdrasilService.setupYggdrasil(profileData.derivedSeed);

        setTimeout(async () => {
            console.log('Setting timeout');
            const yggdrasilAddress = await this._locationService.getOwnLocation();
            console.log('This is my location', yggdrasilAddress);
            if (!yggdrasilAddress) throw new BadRequestException('Could not get own Yggdrasil address.');

            console.log('Registering digital twin');
            await this._locationService.registerDigitalTwin({
                doubleName: profileData.doubleName,
                derivedSeed: profileData.derivedSeed,
                yggdrasilAddress: <string>yggdrasilAddress,
            });
        }, 1000);

        req.session.userId = profileData.userId;
        req.session.save(err => {
            if (!err) {
                res.redirect('/callback');
                return;
            }
        });
    }
}
