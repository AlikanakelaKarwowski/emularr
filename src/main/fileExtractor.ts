import * as fs from 'fs';
import * as path from 'path';
import yauzl from 'yauzl';
import * as tar from 'tar';
import StreamZip from 'node-stream-zip';

export class FileExtractor {
  /**
   * Check if a file should be extracted based on its extension
   */
  static shouldExtract(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const extractableExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz', '.tar.gz', '.tgz'];
    const nonExtractableExtensions = ['.iso', '.nkit', '.ciso', '.wbfs', '.wad'];
    
    // Check for non-extractable formats first
    for (const nonExt of nonExtractableExtensions) {
      if (filePath.toLowerCase().endsWith(nonExt)) {
        return false;
      }
    }
    
    // Check for extractable formats
    return extractableExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
  }

  /**
   * Extract a file to a destination directory
   */
  static async extractFile(filePath: string, destinationDir: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    
    // Ensure destination directory exists
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    try {
      if (ext === '.zip') {
        return await this.extractZip(filePath, destinationDir);
      } else if (ext === '.tar' || ext === '.tar.gz' || ext === '.tgz' || filePath.toLowerCase().endsWith('.tar.gz')) {
        return await this.extractTar(filePath, destinationDir);
      } else if (ext === '.rar') {
        // RAR extraction requires unrar binary or a library
        // For now, we'll try using node-stream-zip which might work for some RAR files
        return await this.extractRar(filePath, destinationDir);
      } else {
        throw new Error(`Unsupported archive format: ${ext}`);
      }
    } catch (error) {
      console.error(`Error extracting ${filePath}:`, error);
      throw error;
    }
  }

  private static async extractZip(filePath: string, destinationDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err);
          return;
        }

        if (!zipfile) {
          reject(new Error('Failed to open zip file'));
          return;
        }

        let extractedPath = destinationDir;
        let entryCount = 0;
        let extractedCount = 0;

        zipfile.readEntry();
        zipfile.on('entry', (entry) => {
          entryCount++;
          if (/\/$/.test(entry.fileName)) {
            // Directory entry
            const dirPath = path.join(destinationDir, entry.fileName);
            if (!fs.existsSync(dirPath)) {
              fs.mkdirSync(dirPath, { recursive: true });
            }
            zipfile.readEntry();
          } else {
            // File entry
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                console.error(`Error reading entry ${entry.fileName}:`, err);
                zipfile.readEntry();
                return;
              }

              const filePath = path.join(destinationDir, entry.fileName);
              const fileDir = path.dirname(filePath);
              
              if (!fs.existsSync(fileDir)) {
                fs.mkdirSync(fileDir, { recursive: true });
              }

              const writeStream = fs.createWriteStream(filePath);
              readStream.pipe(writeStream);

              writeStream.on('close', () => {
                extractedCount++;
                if (extractedCount === entryCount) {
                  // All entries extracted
                  resolve(extractedPath);
                }
                zipfile.readEntry();
              });

              writeStream.on('error', (err) => {
                console.error(`Error writing file ${filePath}:`, err);
                zipfile.readEntry();
              });
            });
          }
        });

        zipfile.on('end', () => {
          if (extractedCount === entryCount) {
            resolve(extractedPath);
          }
        });

        zipfile.on('error', (err) => {
          reject(err);
        });
      });
    });
  }

  private static async extractTar(filePath: string, destinationDir: string): Promise<string> {
    try {
      await tar.extract({
        file: filePath,
        cwd: destinationDir,
      });
      return destinationDir;
    } catch (error) {
      throw new Error(`Failed to extract tar file: ${error}`);
    }
  }

  private static async extractRar(filePath: string, destinationDir: string): Promise<string> {
    // RAR extraction is more complex and may require external tools
    // For now, we'll try node-stream-zip as a fallback
    // Note: node-stream-zip primarily supports ZIP, but we'll try it
    return new Promise((resolve, reject) => {
      const zip = new StreamZip.async({ file: filePath });
      zip.extract(null, destinationDir)
        .then(() => {
          zip.close();
          resolve(destinationDir);
        })
        .catch((err) => {
          zip.close();
          reject(new Error(`RAR extraction not fully supported. Please extract manually: ${err.message}`));
        });
    });
  }

  /**
   * Get the main game file/folder path after extraction
   * Returns the extracted directory or the original file if not extracted
   */
  static getGamePath(originalPath: string, extracted: boolean, extractDir?: string): string {
    if (extracted && extractDir) {
      return extractDir;
    }
    return originalPath;
  }
}
