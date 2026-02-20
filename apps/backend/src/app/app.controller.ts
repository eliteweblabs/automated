import { Controller, Get, Post, UseGuards, Body, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AppService } from './app.service';
import { ClerkAuthGuard } from './auth/clerk-auth.guard';
import { GetUser } from './auth/get-user.decorator';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { WorkflowService } from './workflow/workflow.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly workflowService: WorkflowService
  ) { }

  @Get()
  getData() {
    return this.appService.getData();
  }

  @Get('protected')
  @UseGuards(ClerkAuthGuard)
  getProtectedRoute(@GetUser() user: any) {
    return {
      message: 'This is a protected route',
      user,
    };
  }

  @Post('recordings/merge')
  @UseGuards(ClerkAuthGuard)
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'video', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
  ]))
  async mergeRecording(
    @UploadedFiles()
    files: { video?: Array<{ buffer: Buffer }>; audio?: Array<{ buffer: Buffer }> },
    @Body('sessionId') sessionId?: string,
  ) {
    const outputPath = await this.workflowService.mergeRecordingFiles(files, sessionId);
    return { success: true, filePath: outputPath };
  }
}
