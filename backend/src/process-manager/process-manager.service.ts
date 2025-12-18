import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';

interface ServiceConfig {
  name: string;
  displayName: string;
  description: string;
  directory: string;
  startCommand: string;
  port: number;
}

interface ServicesConfig {
  services: ServiceConfig[];
}

interface RunningProcess {
  process: ChildProcess;
  service: ServiceConfig;
  startedAt: Date;
}

@Injectable()
export class ProcessManagerService implements OnModuleDestroy {
  private servicesConfig: ServicesConfig | null = null;
  private runningProcesses: Map<string, RunningProcess> = new Map();

  async onModuleDestroy() {
    // Clean up all spawned processes when the module is destroyed
    for (const [name, running] of this.runningProcesses) {
      try {
        running.process.kill();
        console.log(`Stopped service: ${name}`);
      } catch (error) {
        console.error(`Error stopping service ${name}:`, error);
      }
    }
  }

  private async loadServicesConfig(): Promise<ServicesConfig> {
    if (this.servicesConfig) {
      return this.servicesConfig;
    }

    const configPath = join(__dirname, '..', '..', 'services.json');
    const content = await fs.readFile(configPath, 'utf8');
    this.servicesConfig = JSON.parse(content);
    return this.servicesConfig;
  }

  async listServices(): Promise<ServiceConfig[]> {
    const config = await this.loadServicesConfig();
    return config.services;
  }

  async getServiceConfig(serviceName: string): Promise<ServiceConfig | null> {
    const config = await this.loadServicesConfig();
    return config.services.find(s => s.name === serviceName) || null;
  }

  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      });
      server.once('listening', () => {
        server.close();
        resolve(false);
      });
      server.listen(port, '127.0.0.1');
    });
  }

  async getServiceStatus(serviceName: string): Promise<{ status: 'running' | 'stopped'; port?: number; error?: string }> {
    const service = await this.getServiceConfig(serviceName);
    if (!service) {
      return { status: 'stopped', error: `Service '${serviceName}' not found` };
    }

    // Check if we have a running process for this service
    const running = this.runningProcesses.get(serviceName);
    if (running && !running.process.killed) {
      // Process exists in our map, check if port is still in use
      const portInUse = await this.isPortInUse(service.port);
      if (portInUse) {
        return { status: 'running', port: service.port };
      }
    }

    // Check if port is in use (service might be running externally)
    const portInUse = await this.isPortInUse(service.port);
    if (portInUse) {
      return { status: 'running', port: service.port };
    }

    return { status: 'stopped', port: service.port };
  }

  async startService(serviceName: string): Promise<{ success: boolean; message: string; port?: number }> {
    const service = await this.getServiceConfig(serviceName);
    if (!service) {
      return { success: false, message: `Service '${serviceName}' not found` };
    }

    // Check if already running
    const status = await this.getServiceStatus(serviceName);
    if (status.status === 'running') {
      return { success: true, message: `Service '${serviceName}' is already running`, port: service.port };
    }

    try {
      // Resolve directory path relative to project root (parent of backend folder)
      const backendDir = join(__dirname, '..', '..');
      const projectRoot = join(backendDir, '..');
      const serviceDir = resolve(projectRoot, service.directory);

      // Check if directory exists
      try {
        await fs.access(serviceDir);
      } catch {
        return { success: false, message: `Directory not found: ${serviceDir}` };
      }

      // Spawn the process in a new shell
      // On Windows, use 'start' command to open a new console window
      // This is the most reliable way to spawn independent background processes on Windows
      const isWindows = process.platform === 'win32';
      let childProcess: ChildProcess;

      console.log(`[${serviceName}] Starting in directory: ${serviceDir}`);
      console.log(`[${serviceName}] Command: ${service.startCommand}`);

      if (isWindows) {
        // Use 'start' to open a new console window that runs independently
        // The /D flag sets the working directory
        // The title is the service name (required when path has spaces)
        childProcess = spawn('cmd.exe', [
          '/c',
          'start',
          `"${serviceName}"`,  // Window title (required)
          '/D',
          serviceDir,
          'cmd.exe',
          '/c',
          service.startCommand
        ], {
          cwd: serviceDir,
          detached: true,
          stdio: 'ignore',  // Must be 'ignore' for proper Windows detachment
          env: { ...process.env },
          windowsHide: false
        });
      } else {
        // On Unix, use sh -c with nohup for background execution
        childProcess = spawn('sh', ['-c', `nohup ${service.startCommand} > /dev/null 2>&1 &`], {
          cwd: serviceDir,
          detached: true,
          stdio: 'ignore',
          env: { ...process.env }
        });
      }

      // Unref to allow the parent process to exit independently
      childProcess.unref();

      // Store the running process (note: on Windows with 'start', this tracks the launcher, not the actual service)
      this.runningProcesses.set(serviceName, {
        process: childProcess,
        service,
        startedAt: new Date()
      });

      childProcess.on('error', (error) => {
        console.error(`[${serviceName}] Process error:`, error);
        this.runningProcesses.delete(serviceName);
      });

      // Poll for up to 120 seconds waiting for the service to start
      const maxWaitTime = 120000; // 120 seconds
      const pollInterval = 2000;  // Check every 2 seconds
      const startTime = Date.now();

      console.log(`[${serviceName}] Waiting for service to start on port ${service.port}...`);

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const status = await this.getServiceStatus(serviceName);
        if (status.status === 'running') {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`[${serviceName}] Service started successfully after ${elapsed}s`);
          return { success: true, message: `Service '${serviceName}' started successfully`, port: service.port };
        }
      }

      // Timeout reached
      console.log(`[${serviceName}] Service failed to start within 120 seconds`);
      return { success: false, message: `Service '${serviceName}' failed to start - port ${service.port} not responding after 120 seconds` };
    } catch (error: any) {
      return { success: false, message: `Failed to start service: ${error.message}` };
    }
  }

  async stopService(serviceName: string): Promise<{ success: boolean; message: string }> {
    const service = await this.getServiceConfig(serviceName);
    if (!service) {
      return { success: false, message: `Service '${serviceName}' not found` };
    }

    const running = this.runningProcesses.get(serviceName);
    if (running && !running.process.killed) {
      try {
        // On Windows, we need to kill the process tree
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', running.process.pid!.toString(), '/f', '/t'], { shell: true });
        } else {
          running.process.kill('SIGTERM');
        }
        this.runningProcesses.delete(serviceName);
        return { success: true, message: `Service '${serviceName}' stopped` };
      } catch (error: any) {
        return { success: false, message: `Failed to stop service: ${error.message}` };
      }
    }

    return { success: false, message: `Service '${serviceName}' is not running (or was started externally)` };
  }
}
