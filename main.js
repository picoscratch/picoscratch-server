import WebSocket, { WebSocketServer } from "ws";
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import { createServer } from "http";

const tasks = JSON.parse(readFileSync("tasks.json", { encoding: "utf-8" }))
const password = readFileSync("password.txt", { encoding: "utf-8" })
const school = readFileSync("school.txt", { encoding: "utf-8" })

const server = createServer();

const wss = new WebSocketServer({
  server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    // Other options settable:
    clientNoContextTakeover: true, // Defaults to negotiated value.
    serverNoContextTakeover: true, // Defaults to negotiated value.
    serverMaxWindowBits: 10, // Defaults to negotiated value.
    // Below options specified as default values.
    concurrencyLimit: 10, // Limits zlib concurrency for perf.
    threshold: 1024 // Size (in bytes) below which messages
    // should not be compressed if context takeover is disabled.
  }
});

/*
EVENTS:

get
RETURN CURRENT LEADERBOARD

add score name
ADD name WITH score TO THE LEADERBOARD AND SAVE
*/

function readLeaderboard() {
	if(!existsSync("leaderboard.json")) writeFileSync("leaderboard.json", JSON.stringify([]), { encoding: "utf-8" });
	const raw = readFileSync("leaderboard.json", { encoding: "utf-8" });
	try {
		return JSON.parse(raw);
	} catch(e) {
		renameSync("leaderboard.json", "leaderboard-broken-" + Math.random() + ".json");
		writeFileSync("leaderboard.json", JSON.stringify([]), { encoding: "utf-8" });
		return [];
	}
}

function isWhatPercentOf(numA, numB) {
  return (numA / numB) * 100;
}

function calculatePercentages(leaderboard) {
	for(let i = 0; i < leaderboard.length; i++) {
		const percent = isWhatPercentOf(leaderboard[i].correctqs, leaderboard[i].answeredqs);
		leaderboard[i].percentage = isNaN(percent) ? 100 : Math.floor(percent);
		leaderboard[i].xp = ((leaderboard[i].level - 1) * 1357) + (leaderboard[i].correctqs * 136);
	}
	return leaderboard;
}

/*
{
	name: "Cfp",
	level: 1,
	answeredqs: 2,
	correctqs: 1,
	achievements: ["fast"],
	achievementdata: {lastday: *Date*, completedLevels: 0}
}
use answeredqs and correctqs to calculate percentage
*/

let admins = [];
let players = [];
let people = {};
let isRunning = false;

function capitalizeWords(arr) {
  return arr.map(element => {
    return element.charAt(0).toUpperCase() + element.slice(1).toLowerCase();
  });
}

function upgradeLeaderboard() {
	console.log("Upgrading leaderboard...");
	const board = readLeaderboard();
	let upgraded = false;

	for(const p of board) {
		if(!p.hasOwnProperty("xp")) {
			board = calculatePercentages(board);
			upgraded = true;
		}
		if(!p.hasOwnProperty("achievements")) {
			p.achievements = [];
			upgraded = true;
		}
		if(!p.hasOwnProperty("achievementdata")) {
			p.achievementdata = {lastday: new Date(0).getTime(), completedLevels: 0};
			upgraded = true;
		}
	}

	if(upgraded) {
		writeFileSync("leaderboard.json", JSON.stringify(board), { encoding: "utf-8" })
	}
	console.log(upgraded ? "Upgraded leaderboard!" : "Nothing to upgrade!");
}

upgradeLeaderboard();

wss.on("connection", (ws) => {
	let name = "UNKNOWN NAME";
	let current_level = 1;
	players.push(ws);
	ws.send("school " + school);
	ws.on("message", (data) => {
		const command = data.toString().split(" ");
		console.log(name + ": " + command.join(" "));
		if(command[0] == "admin") {
			command.splice(0, 1);
			if(command.join(" ") == password) {
				ws.send("approved " + JSON.stringify(readLeaderboard()));
				admins.push(ws);
			} else {
				ws.send("declined");
			}
		} else if(command[0] == "identify") {
			command.splice(0, 1);
			name = command.join(" ").trim();
			name = capitalizeWords(name.split(" ")).join(" ");
			let leaderboard = readLeaderboard();
			if(leaderboard.find(u => u.name == name)) {
				const p = leaderboard.find(u => u.name == name);
				current_level = p.level;
				if(new Date(p.achievementdata.lastday).toDateString() != new Date().toDateString()) {
					p.achievementdata.lastday = new Date().getTime();
					p.achievementdata.completedLevels = 0;
				}
			} else {
				leaderboard.push({name, level: 1, answeredqs: 0, correctqs: 0, percentage: 100, xp: 0, achievements: [], achievementdata: {lastday: Date.now(), completedLevels: 0}});
			}
			leaderboard = leaderboard.sort((a, b) => b.level - a.level);
			writeFileSync("leaderboard.json", JSON.stringify(leaderboard), { encoding: "utf-8" })
			people[name] = ws;
			for(const admin of admins) {
				admin.send("update " + JSON.stringify(leaderboard));
			}
			for(const player of players) {
				player.send("leaderboard " + JSON.stringify(leaderboard));
			}
			ws.send("levelpath " + (current_level - 1) + " " + (tasks.length - 1 - current_level) + " " + (current_level == tasks.length ? "1" : "0"));
		} else if(command[0] == "task") {
			if(!isRunning) {
				ws.send("notrunning");
				return;
			}
			if(!(command[1] <= current_level)) return;
			if(!tasks[command[1]]) {
				// if(!leaderboardpushers.includes(ws)) {
				// 	ws.send("update " + JSON.stringify(readLeaderboard()));
				// 	leaderboardpushers.push(ws);
				// }
				// ws.send("finished");
				return;
			}
			ws.send("task " + JSON.stringify(tasks[command[1]]));
		} else if(command[0] == "done") {
			if(!isRunning) {
				ws.send("notrunning");
				return;
			}
			const level = parseInt(command[1]);
			if(level != current_level) return;
			current_level++;
			let leaderboard = readLeaderboard();
			leaderboard.find(u => u.name == name).level = current_level;
			if(command[2]) {
				leaderboard.find(u => u.name == name).answeredqs = leaderboard.find(u => u.name == name).answeredqs + parseInt(command[2]);
			}
			if(command[3]) {
				leaderboard.find(u => u.name == name).correctqs = leaderboard.find(u => u.name == name).correctqs + parseInt(command[3]);
			}
			leaderboard.find(u => u.name == name).achievementdata.completedLevels++;
			if(leaderboard.find(u => u.name == name).achievementdata.completedLevels == 5) {
				if(!leaderboard.find(u => u.name == name).achievements.includes("fast")) {
					leaderboard.find(u => u.name == name).achievements.push("fast");
				}
			}
			leaderboard = leaderboard.sort((a, b) => b.level - a.level);
			if(leaderboard[0] == leaderboard.find(u => u.name == name)) {
				if(!leaderboard.find(u => u.name == name).achievements.includes("first")) {
					leaderboard.find(u => u.name == name).achievements.push("first");
				}
			}
			leaderboard = calculatePercentages(leaderboard);
			writeFileSync("leaderboard.json", JSON.stringify(leaderboard), { encoding: "utf-8" })
			if(!tasks[current_level]) {
				// if(!leaderboardpushers.includes(ws)) {
				// 	ws.send("update " + JSON.stringify(readLeaderboard()));
				// 	leaderboardpushers.push(ws);
				// }
				// ws.send("finished");
			}
			for(const admin of admins) {
				admin.send("update " + JSON.stringify(leaderboard));
			}
			for(const player of players) {
				player.send("leaderboard " + JSON.stringify(leaderboard));
			}
			ws.send("levelpath " + (current_level - 1) + " " + (tasks.length - 1 - current_level));
		} else if(command[0] == "leaderboard") {
			ws.send("leaderboard " + JSON.stringify(readLeaderboard()));
		} else if(command[0] == "start") {
			if(admins.includes(ws)) {
				if(isRunning) return;
				isRunning = true;
				for(const player of players) {
					player.send("start");
				}
			}
		} else if(command[0] == "end") {
			if(admins.includes(ws)) {
				if(!isRunning) return;
				isRunning = false;
				for(const player of players) {
					player.send("end");
				}
			}
		} else if(command[0] == "kick") {
			if(admins.includes(ws)) {
				command.shift();
				if(people[command.join(" ")]) {
					people[command.join(" ")].send("kick");
					people[command.join(" ")].close();
				}
			}
		} else if(command[0] == "delete") {
			if(admins.includes(ws)) {
				command.shift();
				if(people[command.join(" ")]) {
					people[command.join(" ")].send("kick");
					people[command.join(" ")].close();
				}
				let leaderboard = readLeaderboard();
				leaderboard.splice(leaderboard.findIndex(u => u.name == name), 1);
				leaderboard = leaderboard.sort((a, b) => b.level - a.level);
				writeFileSync("leaderboard.json", JSON.stringify(leaderboard), { encoding: "utf-8" })
				for(const admin of admins) {
					admin.send("update " + JSON.stringify(leaderboard));
				}
				for(const player of players) {
					player.send("leaderboard " + JSON.stringify(leaderboard));
				}
			}
		} else if(command[0] == "info") {
			ws.send("info " + JSON.stringify({
				name: tasks[command[1]].name,
				desc: tasks[command[1]].desc
			}))
		}
	})
	ws.on("close", () => {
		if(name == "UNKNOWN NAME") return;
		if(people[name]) delete people[name];
		if(players.includes(ws)) players.splice(players.indexOf(ws), 1);
	})
})

server.on("request", (req, res) => {
	if(req.url == "/") {
		res.write(readFileSync("index.html"));
		res.end();
	} else if(req.url == "/ui.css") {
		res.write(readFileSync("ui.css"));
		res.end();
	} else if(req.url == "/font/Roboto-Round-Regular.eot") {
		res.write(readFileSync("font/Roboto-Round-Regular.eot"));
		res.end();
	} else if(req.url == "/font/Roboto-Round-Regular.svg") {
		res.write(readFileSync("font/Roboto-Round-Regular.svg"));
		res.end();
	} else if(req.url == "/font/Roboto-Round-Regular.ttf") {
		res.write(readFileSync("font/Roboto-Round-Regular.ttf"));
		res.end();
	} else if(req.url == "/font/Roboto-Round-Regular.woff") {
		res.write(readFileSync("font/Roboto-Round-Regular.woff"));
		res.end();
	} else if(req.url == "/font/Roboto-Round-Regular.woff2") {
		res.write(readFileSync("font/Roboto-Round-Regular.woff2"));
		res.end();
	} else if(req.url.startsWith("/img")) {
		if(req.url.includes("..")) return;
		res.write(readFileSync(req.url.slice(1, req.url.length)));
		res.end();
	}
})

server.listen(8080);
