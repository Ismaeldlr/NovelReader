export interface SqlDb {
    execute(sql: string): Promise<any>;
    select(sql: string): Promise<Array<Record<string, any>>>;
}
export declare const MIGRATIONS: string[];
export declare function applyMigrations(db: SqlDb): Promise<void>;
