const Base = require("./Base");
const {
    bcrypt,
    sqlite,
    io,
    sessions,
    utils
} = Base;
let sockets = Base.sockets;
let captchas = Base.captchas;
const {
    existsSync,
    writeFileSync,
    readFileSync
} = require("fs");

// Database backup
(v => {
    Base.dbToken = v;
    console.log("Token for database: " + v);
    Base.express.app.get("/db.sqlite", (req, res) => {
        if (req.query.pw === Base.dbToken) {
            res.send(require("fs").readFileSync("./db.sqlite"))
        }
    });
})(Base.sessions.generateSessionID(12));

// Maps
const Room = require("./structures/Room");
const Maps = require("./structures/Maps");
const maps = new Maps();
Base.rooms.push(new Room(maps.mapStore.find(v => v.map.name === "default"), "ffa"));

// Clans
const ClanManager = require("./clans/ClanManager.js");
const clans = new ClanManager(Base.express.app, sqlite);
clans.initRoute();

// API
const APIController = require("./api/Controller");
const api = new APIController(Base.express.app);
api.init("get");

// Logger
const Logger = require("./Logger");
const logger = new Logger({
    id: Base.discordAuth.logWebhook.id,
    token: Base.discordAuth.logWebhook.token
});
Base.express.app.use((req, res, next) => {
    if (Base.maintenance.enabled) {
        res.send(readFileSync("./backend/Maintenance.html", "utf8").replace(/\{comment\}/g, Base.maintenance.reason));
        return;
    }
    if (/\/(\?.+)?$/.test(req.originalUrl)) {
        logger.requests.htmlOnly++;
        logger.sessionRequests.htmlOnly++;
    }
    if (req.originalUrl.startsWith("/game/")) {
        logger.requests.ffa++;
        logger.sessionRequests.ffa++;
    }
    logger.requests.total++;
    logger.sessionRequests.total++;
    return next();
});
Base.express.app.use(Base.express.express.static("public"));
logger.setInterval(()=>{
    logger.postDiscord();
}, 60e3);

// SQLite initialization
if (!existsSync("./db.sqlite")) writeFileSync("./db.sqlite", "");
sqlite.open("db.sqlite").then(async() => {
    // Create tables if they don't already exist
    await sqlite.run("CREATE TABLE IF NOT EXISTS logs (`name` TEXT, `amount` INTEGER)");
    await sqlite.run("CREATE TABLE IF NOT EXISTS clans (`name` TEXT, `leader` TEXT, `cr` INTEGER DEFAULT 0, `members` TEXT, `description` TEXT)");
    await sqlite.run("CREATE TABLE IF NOT EXISTS verifications (`user` TEXT, `code` TEXT, `requestedAt` TEXT)");
    await sqlite.run("CREATE TABLE IF NOT EXISTS recentPromotions (`user` TEXT, `newTier` TEXT, `drop` INTEGER, `promotedAt` TEXT)");
    await sqlite.run("CREATE TABLE IF NOT EXISTS news (`headline` TEXT, `content` TEXT, `createdAt` TEXT)");
    await sqlite.run("CREATE TABLE IF NOT EXISTS accounts (`username` TEXT, `password` TEXT, `br` INTEGER, `createdAt` TEXT, `role` INTEGER, `blobcoins` INTEGER, `lastDailyUsage` TEXT, `distance` INTEGER, blobs `TEXT`, `activeBlob` TEXT, `clan` TEXT, `wins` INTEGER, `losses` INTEGER)");
    await sqlite.run("CREATE TABLE IF NOT EXISTS sessionids (`username` TEXT, `sessionid` TEXT, `expires` TEXT)");
    await sqlite.run("CREATE TABLE IF NOT EXISTS bans (`username` TEXT, `reason` TEXT, `bannedAt` TEXT, `expires` TEXT, `moderator` TEXT)");
}).catch(console.log);

setInterval(async () => {
    captchas = captchas.filter(val => (val.createdAt + 18e4) > Date.now());
    Base.sockets = Base.sockets.filter(val => val.inactiveSince === null || Date.now() < (val.inactiveSince + 30000));
    io.sockets.emit("appHeartbeat", {
		online: Base.sockets.map(v => { return {
			location: "Lobby",
			br: v.br,
			username: v.username,
			lastDaily: v.lastDaily,
			role: v.role
		}}).concat(Base.rooms.find(v => v.id === "ffa").players.map(v => { return {
			location: "FFA",
			username: v.owner,
			br: v.br,
			role: 0
		}})),
		promotions: await sqlite.all("SELECT * FROM recentPromotions ORDER BY promotedAt DESC LIMIT 10")
    });
}, 1000);

setInterval(() => {
	io.sockets.emit("coordinateChange", Base.rooms.find(v => v.id === "ffa").players);
}, 20);

if (!Base.maintenance.enabled){
    io.on("connection", data => {
    try {
        data.on("disconnect", () => {
            const r = require("./events/disconnect").run(data, Base, io);
            Base.sockets = r.sockets;
            Base.rooms[Base.rooms.findIndex(v => v.id === "ffa")].players = r.players;
        });
        data.on("appCreate", async _ => {
            try {
                await require("./events/appCreate").run(_, utils.displayError, sessions, io, data, sqlite, sockets);
                const session = await sessions.getSession(sqlite, {
					type: "session",
					value: _
				});
				if (!session) return;
				const dbData = await require("./utils/getDataFromPlayer")(session.username, sqlite);
				if (Base.sockets.some(v => v.username === session.username)) Base.sockets.splice(Base.sockets.findIndex(v => v.username === session.username), 1);
                Base.sockets.push({
                    sessionid: _,
                    socketid: data.id,
                    username: session.username || "?",
                    br: await require("./utils/getBRFromPlayer")(session.username, sqlite),
                    role: dbData.role,
                    lastDaily: dbData.lastDailyUsage,
                    inactiveSince: null
                });
            } catch (e) {
                console.log(e);
            }
        });

        // FFA Events
        data.on("ffaPlayerCreate", blob => {
            require("./events/ffaPlayerCreate").run(blob, io, Base, data, Base.sockets);
        });
        data.on("coordinateChange", eventd => {
            require("./events/ffaCoordinateChange").run(eventd, data, io, Base, sqlite);
        });
        data.on("ffaDirectionChange", eventd => {
            require("./events/ffaDirectionChange").run(eventd, data, io, Base);
        });
        data.on("ffaNomKey", () => require("./events/ffaNomKey").run(data, io, Base, sqlite));
        data.on("ffaKickPlayer", eventd => require("./events/ffaKickPlayer").run(eventd, data, io, Base));

        // Other events
	    data.on("requestOnlineCount", () => io.to(data.id).emit("onlineCount", Base.sockets.filter(v => v.inactiveSince === null).concat(Base.rooms.find(v => v.id === "ffa").players).length));
        data.on("getCaptcha", () => require("./events/getCaptcha").run(sessions, io, data, captchas).then(res => captchas = res));
        data.on("login", res => require("./events/login").run(res, io, data, sqlite, bcrypt, sessions, utils.displayError));
        data.on("register", res => require("./events/register").run(res, io, data, utils.displayError, captchas, bcrypt, sqlite));
        data.on("sessionDelete", sessionid => require("./events/sessionDelete").run(sessionid, sessions, sqlite, io, data));
        data.on("receiveDailyBonus", () => require("./events/receiveDailyBonus").run(data, io, Base.sockets, sqlite));
        data.on("switchBlob", blob => require("./events/switchBlob").run(data, io, Base.sockets, sqlite, blob));
        data.on("ffaSinglePlayerCreate", blob => require("./events/ffaSinglePlayerCreate").run(blob, io, Base, data, Base.sockets));
        data.on("singleplayerNomKey", eventd => require("./events/singleplayerNomKey").run(data, io, Base, sqlite, eventd));
    } catch (e) {}
    });
} else {
    console.log("Maintenance mode enabled.");
}