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
  animalImportCommitSchema,
  animalListQuerySchema,
  animalUpdateSchema,
  markerPlaceSchema,
  tagReplaceSchema,
  weightCreateSchema,
} from '@farm/contracts';
import type {
  AnimalCreate,
  AnimalDetailDto,
  AnimalDto,
  AnimalEconomicsDto,
  AnimalImportCommit,
  AnimalListQuery,
  AnimalUpdate,
  MarkerPlace,
  PageResult,
  TagReplace,
  WeightCreate,
  WeightRecordDto,
} from '@farm/contracts';
import type { Response } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProfitService } from '../profit/profit.service';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { AnimalsService } from './animals.service';
import { BreedingWatchService } from '../breeding/breeding-watch.service';

@ApiTags('animals')
@Controller('animals')
export class AnimalsController {
  constructor(
    private readonly animals: AnimalsService,
    private readonly profit: ProfitService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly watch: BreedingWatchService,
  ) {}

  @Get('search')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'Numeric shed search: 42 finds B42 and C42' })
  search(@CurrentUser() user: RequestUser, @Query('q') q: string) {
    return this.animals.search(user, q ?? '');
  }

  @Get('profitability')
  @RequirePermissions('finance:read')
  @ApiOperation({ summary: 'Ranked profit per animal at the effective milk price' })
  profitability(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sort') sort?: 'profit_desc' | 'profit_asc',
  ) {
    return this.profit.profitability(
      user.farmId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      sort === 'profit_asc' ? 'profit_asc' : 'profit_desc',
    );
  }

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

  @Post('import/preview')
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Preview a spreadsheet of animals before committing' })
  previewImport(@Body() body: { csv?: string }) {
    return this.animals.previewImport(body.csv ?? '');
  }

  @Post('import')
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Commit a previewed animal import' })
  commitImport(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(animalImportCommitSchema)) body: AnimalImportCommit,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.animals.commitImport(user, body, requestId);
  }

  @Get('tags/print')
  @RequirePermissions('animals:read')
  @ApiOperation({ summary: 'Tag sheet data: large short number, QR underneath' })
  printTags(@CurrentUser() user: RequestUser, @Query('ids') ids?: string) {
    return this.animals.printTags(user, ids ? ids.split(',').filter(Boolean) : undefined);
  }

  @Post(':id/retag')
  @RequirePermissions('animals:write')
  replaceTag(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(tagReplaceSchema)) body: TagReplace,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.animals.replaceTag(user, id, body, requestId);
  }

  @Post('markers')
  @RequirePermissions('animals:write')
  placeMarker(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(markerPlaceSchema)) body: MarkerPlace,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.animals.placeMarker(user, body, requestId);
  }

  @Post('markers/:id/remove')
  @RequirePermissions('animals:write')
  removeMarker(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { byScan?: boolean },
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.animals.removeMarker(user, id, body.byScan !== false, requestId);
  }

  @Get(':id/repro-timeline')
  @RequirePermissions('breeding:read')
  @ApiOperation({ summary: 'Current reproductive cycle timeline' })
  reproTimeline(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.watch.getTimeline(user, id);
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

  @Delete(':id/weights/:weightId')
  @HttpCode(204)
  @RequirePermissions('animals:write')
  @ApiOperation({ summary: 'Delete a weight measurement' })
  async removeWeight(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('weightId', ParseUUIDPipe) weightId: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<void> {
    await this.animals.removeWeight(user, id, weightId, requestId);
  }
}
