import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  loginRequestSchema,
  profileUpdateSchema,
  refreshRequestSchema,
} from '@farm/contracts';
import type {
  LoginRequest,
  LoginResponse,
  ProfileUpdate,
  RefreshRequest,
  TokenPair,
} from '@farm/contracts';
import { CurrentUser, Public } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in with email and password' })
  login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Headers('x-request-id') requestId?: string,
  ): Promise<LoginResponse> {
    return this.auth.login(body, requestId);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a refresh token' })
  refresh(
    @Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequest,
  ): Promise<TokenPair> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(@CurrentUser() user: RequestUser): Promise<void> {
    await this.auth.logout(user.sessionId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current principal, role, farm mode, and permission map' })
  me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user.id, user.farmId, user.role);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update your own name or SMS phone number' })
  updateMe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(profileUpdateSchema)) body: ProfileUpdate,
  ) {
    return this.auth.updateProfile(user.id, user.farmId, user.role, body);
  }
}
