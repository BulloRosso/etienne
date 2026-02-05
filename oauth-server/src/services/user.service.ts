import bcrypt from 'bcrypt';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { User, UserConfig } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// In Docker, users.json is mounted at /users/users.json
// Outside Docker, it's in the config directory
const DOCKER_CONFIG_PATH = '/users/users.json';
const LOCAL_CONFIG_PATH = join(__dirname, '../../config/users.json');
const CONFIG_PATH = existsSync(DOCKER_CONFIG_PATH) ? DOCKER_CONFIG_PATH : LOCAL_CONFIG_PATH;

const SALT_ROUNDS = 10;

export class UserService {
  private config: UserConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): UserConfig {
    if (!existsSync(CONFIG_PATH)) {
      throw new Error(`Users config not found at ${CONFIG_PATH}`);
    }
    const data = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  }

  public reloadConfig(): void {
    this.config = this.loadConfig();
  }

  public getSettings() {
    return this.config.settings;
  }

  public findByUsername(username: string): User | undefined {
    return this.config.users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.enabled
    );
  }

  public findById(id: string): User | undefined {
    return this.config.users.find((u) => u.id === id && u.enabled);
  }

  public async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  public static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  public getAllUsers(): Omit<User, 'passwordHash'>[] {
    return this.config.users.map(({ passwordHash, ...user }) => user);
  }

  /**
   * Update a user's password
   * @param userId The user's ID
   * @param newPasswordHash The new bcrypt-hashed password
   * @returns true if successful, false if user not found
   */
  public updatePassword(userId: string, newPasswordHash: string): boolean {
    const userIndex = this.config.users.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
      return false;
    }

    this.config.users[userIndex].passwordHash = newPasswordHash;
    this.saveConfig();
    return true;
  }

  /**
   * Save the current config to disk
   */
  private saveConfig(): void {
    writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf-8');
  }
}

export const userService = new UserService();
