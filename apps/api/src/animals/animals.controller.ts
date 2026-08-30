import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  animalCreateSchema,
  animalListQuerySchema,
  animalUpdateSchema,
  weightCreateSchema,
} from '@farm/contracts';
import type {
  AnimalCreate,
  AnimalDetailDto,
  AnimalDto,
  AnimalEconomicsDto,
  AnimalListQuery,
  AnimalUpdate,
  PageResult,
  WeightCreate,
  WeightRecordDto,
} from '@farm/contracts';
import type { Response } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { AnimalsService } from './animals.service';

@ApiTags('animals')
@Controller('animals')
export class AnimalsController {
  constructor(
    private readonly animals: AnimalsService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  @Get()
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'List animals with search and filters' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(animalListQuerySchema)) query: AnimalListQuery,
  ): Promise<PageResult<AnimalDto>> {
    return this.animals.list(user, query);
  }

  @Get('export.csv')
  @RequirePermissions('export:data')
  @ApiOperation({ summary: 'Export animal inventory as CSV' })
  async exportCsv(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.animals.exportCsv(user);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader(
      'content-disposition',
      `attachment; filename="animals-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }

  @Get(':id')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'Animal detail with weight history' })
  get(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AnimalDetailDto> {
    return this.animals.get(user, id);
  }

  @Get(':id/economics')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'Invested vs earned summary for an animal (QR scan)' })
  economics(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AnimalEconomicsDto> {
    return this.animals.economics(user, id);
  }

  @Get(':id/production-stats')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'Milk yield vs own and herd average' })
  productionStats(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.animals.productionStats(user, id);
  }

  @Post(':id/photo')
  @RequirePermissions('animals:write')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload animal photo' })
  uploadPhoto(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string },
    @Headers('x-request-id') requestId?: string,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Multipart file field "file" is required',
      });
    }
    return this.animals.uploadPhoto(user, id, file, this.storage, requestId);
  }

  @Get(':id/photo')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'Download animal photo' })
  async getPhoto(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.animals.getPhotoBuffer(user, id, this.storage);
    res.setHeader('content-type', 'image/jpeg');
    res.setHeader('content-disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }

  @Post()
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Create an animal' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(animalCreateSchema)) body: AnimalCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<AnimalDetailDto> {
    return this.animals.create(user, body, requestId);
  }

  @Patch(':id')
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Update an animal' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(animalUpdateSchema)) body: AnimalUpdate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<AnimalDetailDto> {
    return this.animals.update(user, id, body, requestId);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('animals:delete')
  @ApiOperation({ summary: 'Soft-delete an animal' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    await this.animals.remove(user, id, requestId);
  }

  @Post(':id/weights')
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Add a weight measurement' })
  addWeight(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(weightCreateSchema)) body: WeightCreate,
    @Headers('x-request-id') requestId?: string,
  ): Promise<WeightRecordDto> {
    return this.animals.addWeight(user, id, body, requestId);
  }
}
