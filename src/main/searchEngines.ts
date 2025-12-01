import axios from "axios";
import * as cheerio from "cheerio";
import * as https from "https";

export interface SearchResult {
    title: string;
    source: string;
    downloadUrl: string;
    type: "torrent" | "magnet" | "direct";
    size?: string;
    seeders?: number;
    leechers?: number;
    platform?: string;
    metadata?: {
        description?: string;
        releaseDate?: string;
    };
}

class SearchEngines {
    async searchVimmsLair(query: string): Promise<SearchResult[]> {
        try {
            const response = await axios.get(`https://vimm.net/vault/?q=${encodeURIComponent(query)}`, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
                httpsAgent: new (require("https").Agent)({
                    rejectUnauthorized: false, // Disable SSL verification for Vimm's Lair
                }),
            });

            const $ = cheerio.load(response.data);
            const results: SearchResult[] = [];

            $(".game-item").each((_, element) => {
                const title = $(element).find(".game-title").text().trim();
                const link = $(element).find("a").attr("href");
                const platform = $(element).find(".platform").text().trim();

                if (title && link) {
                    results.push({
                        title,
                        source: "Vimm's Lair",
                        downloadUrl: link.startsWith("http") ? link : `https://vimm.net${link}`,
                        type: "direct",
                        platform,
                    });
                }
            });

            return results;
        } catch (error) {
            console.error("Vimm's Lair search error:", error);
            return [];
        }
    }

    async searchMyrient(query: string): Promise<SearchResult[]> {
        try {
            // Myrient uses a different structure - this is a placeholder
            // Actual implementation would need to parse their specific format
            const response = await axios.get(`https://myrient.erista.me/files/Redump/`, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
            });

            const $ = cheerio.load(response.data);
            const results: SearchResult[] = [];

            // Parse Myrient directory listing
            $("a").each((_, element) => {
                const text = $(element).text().trim();
                const href = $(element).attr("href");

                if (text && href && text.toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                        title: text,
                        source: "Myrient",
                        downloadUrl: href.startsWith("http") ? href : `https://myrient.erista.me${href}`,
                        type: "direct",
                    });
                }
            });

            return results;
        } catch (error) {
            console.error("Myrient search error:", error);
            return [];
        }
    }

    async searchFitGirl(query: string): Promise<SearchResult[]> {
        try {
            // FitGirl Repacks search - placeholder implementation
            // Note: FitGirl has anti-scraping measures, so this may need adjustments
            const response = await axios.get(`https://fitgirl-repacks.site/?s=${encodeURIComponent(query)}`, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
            });

            const $ = cheerio.load(response.data);
            const results: SearchResult[] = [];

            $("article").each((_, element) => {
                const title = $(element).find("h2 a").text().trim();
                const link = $(element).find("h2 a").attr("href");

                if (title && link) {
                    results.push({
                        title,
                        source: "FitGirl Repacks",
                        downloadUrl: link,
                        type: "torrent",
                        platform: "PC",
                    });
                }
            });

            return results;
        } catch (error) {
            console.error("FitGirl search error:", error);
            return [];
        }
    }

    async searchCrocdb(query: string): Promise<SearchResult[]> {
        try {
            // CrocDB API search - uses JSON POST request
            // API endpoint: https://api.crocdb.net/search
            const response = await axios.post(
                "https://api.crocdb.net/search",
                {
                    search_key: query,
                    max_results: 50,
                    page: 1,
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    },
                }
            );

            // API returns { info: {}, data: { results: [...] } }
            const apiResponse = response.data;
            if (!apiResponse || !apiResponse.data || !apiResponse.data.results) {
                console.warn("CrocDB API returned unexpected format:", apiResponse);
                return [];
            }

            const games = apiResponse.data.results;
            if (!Array.isArray(games)) {
                return [];
            }

            const results: SearchResult[] = [];

            for (const game of games) {
                if (!game.title || !game.links || !Array.isArray(game.links)) {
                    continue;
                }

                // Process each download link for this game
                for (const link of game.links) {
                    if (!link.url) continue;

                    // Determine link type based on URL
                    let linkType: "torrent" | "magnet" | "direct" = "direct";
                    if (link.url.startsWith("magnet:")) {
                        linkType = "magnet";
                    } else if (link.url.endsWith(".torrent") || link.type?.toLowerCase().includes("torrent")) {
                        linkType = "torrent";
                    }

                    results.push({
                        title: game.title,
                        source: link.host || "CrocDB",
                        downloadUrl: link.url,
                        type: linkType,
                        size: link.size_str || (link.size ? this.formatBytes(link.size) : undefined),
                        platform: game.platform,
                        metadata: {
                            description: game.title,
                        },
                    });
                }
            }

            return results;
        } catch (error: any) {
            console.error("CrocDB search error:", error.response?.status, error.message || error);
            if (error.response?.data) {
                console.error("API error response:", error.response.data);
            }
            return [];
        }
    }

    // Helper method to format bytes
    private formatBytes(bytes: number): string {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    }

    async searchAll(query: string): Promise<SearchResult[]> {
        // Only use CrocDB for now
        try {
            return await this.searchCrocdb(query);
        } catch (error) {
            console.error("CrocDB search error:", error);
            return [];
        }
    }

    // Search only CrocDB with platform/region filters (useful for focused searches)
    async searchCrocdbOnly(query: string, platform?: string, region?: string): Promise<SearchResult[]> {
        try {
            const requestBody: any = {
                search_key: query,
                max_results: 50,
                page: 1,
            };

            // Add platform filter if provided (use lowercase as per API docs)
            if (platform) {
                requestBody.platforms = [platform.toLowerCase()];
            }

            // Add region filter if provided (use lowercase as per API docs)
            if (region) {
                requestBody.regions = [region.toLowerCase()];
            }

            const response = await axios.post("https://api.crocdb.net/search", requestBody, {
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                },
            });

            const apiResponse = response.data;
            if (!apiResponse || !apiResponse.data || !apiResponse.data.results) {
                return [];
            }

            const games = apiResponse.data.results;
            if (!Array.isArray(games)) {
                return [];
            }

            const results: SearchResult[] = [];

            for (const game of games) {
                if (!game.title || !game.links || !Array.isArray(game.links)) {
                    continue;
                }

                for (const link of game.links) {
                    if (!link.url) continue;

                    let linkType: "torrent" | "magnet" | "direct" = "direct";
                    if (link.url.startsWith("magnet:")) {
                        linkType = "magnet";
                    } else if (link.url.endsWith(".torrent") || link.type?.toLowerCase().includes("torrent")) {
                        linkType = "torrent";
                    }

                    results.push({
                        title: game.title,
                        source: link.host || "CrocDB",
                        downloadUrl: link.url,
                        type: linkType,
                        size: link.size_str || (link.size ? this.formatBytes(link.size) : undefined),
                        platform: game.platform,
                        metadata: {
                            description: game.title,
                        },
                    });
                }
            }

            return results;
        } catch (error: any) {
            console.error("CrocDB search error:", error.response?.status, error.message || error);
            return [];
        }
    }
}

export const searchEngines = new SearchEngines();
