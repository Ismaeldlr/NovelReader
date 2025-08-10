import type { Novel } from "../models/Novel";
export interface IDatabase {
    init(): Promise<void>;
    listNovels(): Promise<Novel[]>;
    addNovel(n: Novel): Promise<void>;
}
export declare class LibraryController {
    private db;
    constructor(db: IDatabase);
    init(): Promise<void>;
    getNovels(): Promise<Novel[]>;
    addSample(): Promise<Novel[]>;
}
