import Base from "./Base";

// Clan structure in database
export interface ClanData {
    name: string;
    leader: string;
    cr: number;
    members: string;
    description: string;
    joinable: number;
    tag: string;
}

// Used to represent a clan
export default class Clan {
    // The name of this clan
    public name: string;
    // The leader of this clan
    public leader: string;
    // The rating of this clan (signed)
    public cr: number;
    // Raw string of all members (split by , to get an array)
    public members: Array<string>;
    // The clan description
    public description: string;
    // Whether this clan is joinable or not
    public joinable: boolean;
    // The tag of this clan (1-4 characteres)
    public tag: string;

    constructor(data: ClanData) {
        this.cr = data.cr;
        this.description = data.description;
        this.joinable = typeof data.joinable === "number" ? Boolean(data.joinable) : data.joinable;
        this.leader = data.leader;
        this.members = JSON.parse(data.members);
        this.name = data.name;
        this.tag = data.tag;
    }

    public static delete(data: ClanData | string, base: Base): Promise<Array<any>> {
        const target: string = typeof data !== "string" ? data.name : data;
        return Promise.all([
            base.db.run("DELETE FROM clans WHERE name = ?", target),
            base.db.run("UPDATE accounts SET clan = ? WHERE clan = ?", null, target)
        ]);
    }
}