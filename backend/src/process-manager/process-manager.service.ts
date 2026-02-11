import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { spawn, ChildProcess, execSync } from 'child_process';
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
  private shellPath: string | null = null;
  private shellChecked = false;

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

  /**
   * Find bash/sh shell on the current platform.
   * - macOS/Linux: uses /bin/bash or /bin/sh (always available)
   * - Windows: checks for Git Bash, then WSL bash, then falls back to null (cmd.exe)
   * Result is cached after first call.
   */
  private findShell(): string | null {
    if (this.shellChecked) return this.shellPath;
    this.shellChecked = true;

    const isWindows = process.platform === 'win32';

    if (!isWindows) {
      // macOS / Linux — check bash first, fall back to sh
      const unixCandidates = ['/bin/bash', '/usr/bin/bash', '/bin/sh'];
      for (const candidate of unixCandidates) {
        try {
          require('fs').accessSync(candidate);
          this.shellPath = candidate;
          console.log(`[ProcessManager] Using shell: ${candidate}`);
          return this.shellPath;
        } catch {
          // Try next
        }
      }
      // sh should always exist, but try which as last resort
      try {
        const result = execSync('which sh', { encoding: 'utf8', timeout: 3000 }).trim();
        if (result) {
          this.shellPath = result;
          console.log(`[ProcessManager] Using shell (via which): ${result}`);
          return this.shellPath;
        }
      } catch {
        // Shouldn't happen on Unix
      }
      return null;
    }

    // Windows — look for Git Bash
    const winCandidates = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ];

    for (const candidate of winCandidates) {
      try {
        require('fs').accessSync(candidate);
        this.shellPath = candidate;
        console.log(`[ProcessManager] Found Git Bash at: ${candidate}`);
        return this.shellPath;
      } catch {
        // Not found, try next
      }
    }

    // Try to find bash via PATH using 'where'
    try {
      const result = execSync('where bash.exe', { encoding: 'utf8', timeout: 3000 }).trim();
      const lines = result.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        this.shellPath = lines[0];
        console.log(`[ProcessManager] Found bash via PATH: ${lines[0]}`);
        return this.shellPath;
      }
    } catch {
      // 'where' failed or bash not in PATH
    }

    console.log('[ProcessManager] No bash found on Windows, falling back to cmd.exe');
    return null;
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
    if (!port) return false;

    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);

      const cleanup = (result: boolean) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(result);
      };

      socket.once('connect', () => cleanup(true));
      socket.once('timeout', () => cleanup(false));
      socket.once('error', () => cleanup(false));

      try {
        socket.connect(port, '127.0.0.1');
      } catch {
        cleanup(false);
      }
    });
  }

  async getServiceStatus(serviceName: string): Promise<{ status: 'running' | 'stopped'; port?: number; error?: string }> {
    const service = await this.getServiceConfig(serviceName);
    if (!service) {
      return { status: 'stopped', error: `Service '${serviceName}' not found` };
    }

    // Services without a port — check if we have a tracked process
    if (!service.port) {
      const running = this.runningProcesses.get(serviceName);
      if (running && !running.process.killed) {
        return { status: 'running' };
      }
      return { status: 'stopped' };
    }

    // Check if port is in use (covers both tracked and externally-started services)
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

      let childProcess: ChildProcess;

      console.log(`[${serviceName}] Starting in directory: ${serviceDir}`);
      console.log(`[${serviceName}] Command: ${service.startCommand}`);

      const shell = this.findShell();

      if (shell) {
        // Use bash/sh on all platforms (native on macOS/Linux, Git Bash on Windows)
        childProcess = spawn(shell, ['-c', service.startCommand], {
          cwd: serviceDir,
          detached: true,
          stdio: 'ignore',
          env: { ...process.env }
        });
        console.log(`[${serviceName}] Started via ${shell} (pid: ${childProcess.pid})`);
      } else {
        // Fallback: cmd.exe on Windows (no bash available)
        childProcess = spawn('cmd.exe', [
          '/c',
          'start',
          `"${serviceName}"`,
          '/D',
          serviceDir,
          'cmd.exe',
          '/c',
          service.startCommand
        ], {
          cwd: serviceDir,
          detached: true,
          stdio: 'ignore',
          env: { ...process.env },
          windowsHide: false
        });
      }

      // Unref to allow the parent process to exit independently
      childProcess.unref();

      // Store the running process
      this.runningProcesses.set(serviceName, {
        process: childProcess,
        service,
        startedAt: new Date()
      });

      childProcess.on('error', (error) => {
        console.error(`[${serviceName}] Process error:`, error);
        this.runningProcesses.delete(serviceName);
      });

      // Return immediately - the frontend will poll for status
      // This allows starting multiple services in parallel
      return { success: true, message: `Service '${serviceName}' is starting...`, port: service.port };
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
