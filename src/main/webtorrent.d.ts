declare module 'webtorrent' {
  export interface TorrentFile {
    name: string;
    path: string;
    length: number;
    progress: number;
  }

  export interface Torrent extends NodeJS.EventEmitter {
    infoHash: string;
    magnetURI: string;
    files: TorrentFile[];
    downloaded: number;
    uploaded: number;
    downloadSpeed: number;
    uploadSpeed: number;
    progress: number;
    ratio: number;
    numPeers: number;
    maxWebConns: number;
    path: string;
    ready: boolean;
    paused: boolean;
    done: boolean;
    timeRemaining: number;
    received: number;
    bitfield: any;
    wires: any[];
    announce: any[];
    pause(): void;
    resume(): void;
    destroy(callback?: (err?: Error) => void): void;
    addPeer(peer: string): boolean;
    removePeer(peer: string): boolean;
    select(start: number, end: number, priority?: number): void;
    deselect(start: number, end: number, priority?: number): void;
    createServer(opts?: any): any;
  }

  export interface Instance {
    torrents: Torrent[];
    get(hash: string): Torrent | undefined;
    add(torrentId: string | Buffer | File | Blob, opts?: any, callback?: (torrent: Torrent) => void): Torrent;
    seed(input: string | string[] | File | File[] | FileList | Buffer | Buffer[], opts?: any, callback?: (torrent: Torrent) => void): Torrent;
    remove(torrentId: string | Torrent, callback?: (err?: Error) => void): void;
    destroy(callback?: (err?: Error) => void): void;
    on(event: 'torrent', callback: (torrent: Torrent) => void): this;
    on(event: 'error', callback: (err: Error) => void): this;
  }

  export default class WebTorrent implements Instance {
    torrents: Torrent[];
    constructor(opts?: any);
    get(hash: string): Torrent | undefined;
    add(torrentId: string | Buffer | File | Blob, opts?: any, callback?: (torrent: Torrent) => void): Torrent;
    seed(input: string | string[] | File | File[] | FileList | Buffer | Buffer[], opts?: any, callback?: (torrent: Torrent) => void): Torrent;
    remove(torrentId: string | Torrent, callback?: (err?: Error) => void): void;
    destroy(callback?: (err?: Error) => void): void;
    on(event: 'torrent', callback: (torrent: Torrent) => void): this;
    on(event: 'error', callback: (err: Error) => void): this;
  }
}
