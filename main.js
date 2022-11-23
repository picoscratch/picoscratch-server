import WebSocket, { WebSocketServer } from "ws";
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import { createServer } from "http";

const tasks = JSON.parse(readFileSync("tasks.json", { encoding: "utf-8" }))
const password = readFileSync("password.txt", { encoding: "utf-8" })

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

/*
{
	name: "Jannik",
	level: 1
}
*/

let admins = [];
let players = [];
let isRunning = false;

wss.on("connection", (ws) => {
	let name = "UNKNOWN NAME";
	let current_level = 1;
	players.push(ws);
	ws.on("message", (data) => {
		const command = data.toString().split(" ");
		console.log(name + ": " + command[0]);
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
			name = command.join(" ");
			let leaderboard = readLeaderboard();
			if(leaderboard.find(u => u.name == name)) {
				current_level = leaderboard.find(u => u.name == name).level;
			} else {
				leaderboard.push({name, level: 1});
			}
			leaderboard = leaderboard.sort((a, b) => b.level - a.level);
			writeFileSync("leaderboard.json", JSON.stringify(leaderboard), { encoding: "utf-8" })
			for(const admin of admins) {
				admin.send("update " + JSON.stringify(leaderboard));
			}
		} else if(command[0] == "task") {
			if(!isRunning) {
				ws.send("notrunning");
				return;
			}
			if(!tasks[current_level]) {
				return;
			}
			ws.send("task " + JSON.stringify(tasks[current_level]));
		} else if(command[0] == "done") {
			if(!isRunning) {
				ws.send("notrunning");
				return;
			}
			current_level++;
			if(!tasks[current_level]) {
				ws.send("finished");
			}
			let leaderboard = readLeaderboard();
			leaderboard.find(u => u.name == name).level = current_level;
			leaderboard = leaderboard.sort((a, b) => b.level - a.level);
			writeFileSync("leaderboard.json", JSON.stringify(leaderboard), { encoding: "utf-8" })
			for(const admin of admins) {
				admin.send("update " + JSON.stringify(leaderboard));
			}
		} else if(command[0] == "leaderboard") {
			ws.send("leaderboard " + JSON.stringify(readLeaderboard()));
		} else if(command[0] == "start") {
			isRunning = true;
			if(admins.includes(ws)) {
				for(const player of players) {
					player.send("start");
				}
			}
		} else if(command[0] == "end") {
			isRunning = false;
			if(admins.includes(ws)) {
				for(const player of players) {
					player.send("end");
				}
			}
		}
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
	}
})

server.listen(8080);