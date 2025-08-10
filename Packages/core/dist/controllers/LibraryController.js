export class LibraryController {
    constructor(db) {
        this.db = db;
    }
    async init() { await this.db.init(); }
    async getNovels() { return this.db.listNovels(); }
    async addSample() {
        await this.db.addNovel({ title: "Hello from shared core" });
        return this.getNovels();
    }
}
