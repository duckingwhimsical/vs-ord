declare module 'adm-zip' {
  class AdmZip {
    constructor(filePath?: string);
    extractAllTo(targetPath: string, overwrite?: boolean): void;
    getEntries(): Array<{ entryName: string }>;
  }
  export = AdmZip;
}

declare module 'tree-kill' {
  function treeKill(pid: number, signal?: string, callback?: (error?: Error) => void): void;
  export = treeKill;
}

declare module 'glob' {
  interface GlobOptions {
    cwd?: string;
    dot?: boolean;
    ignore?: string | string[];
  }
  export function glob(pattern: string, options?: GlobOptions): Promise<string[]>;
  export function globSync(pattern: string, options?: GlobOptions): string[];
}
