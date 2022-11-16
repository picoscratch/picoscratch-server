import WebSocket, { WebSocketServer } from "ws";
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";

const wss = new WebSocketServer({
  port: 8080,
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

wss.on("connection", (ws) => {
	ws.on("message", (data) => {
		const command = data.toString().split(" ");
		if(command[0] == "get") {
			ws.send(JSON.stringify(readLeaderboard()));
		} else if(command[0] == "add") {
			let leaderboard = readLeaderboard();
			if(isNaN(command[1])) {
				ws.send("INVALIDSCORE")
				return;
			}
			const score = parseInt(command[1]);
			command.splice(0, 2);
			leaderboard.push({name: command.join(" "), score});
			leaderboard = leaderboard.sort((a, b) => b.score - a.score)
			writeFileSync("leaderboard.json", JSON.stringify(leaderboard), { encoding: "utf-8" })
			ws.send("OK");
		}
	})
})