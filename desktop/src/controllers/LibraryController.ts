import type { Novel } from "../models/Novel";

export interface IDatabase {
  init(): Promise<void>;
  listNovels(): Promise<Novel[]>;
  addNovel(n: Novel): Promise<void>;
}

export class LibraryController {
  constructor(private db: IDatabase) {}
  async init() { await this.db.init(); }
  async getNovels() { return this.db.listNovels(); }
  async addSample() {
    await this.db.addNovel({ title: "Hello from shared core" });
    return this.getNovels();
  }
}
