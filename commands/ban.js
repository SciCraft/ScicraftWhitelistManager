const Utils = require("../Utils");
const Config = require("../Config");

const argumentAmt = {min:1,max:3};

function run(discordClient, isAdmin, highestRole, user, channel, args) { //Function to run
    Utils.parseUsername(args[0],channel,(username) => {
        var runQuietly, runSingle = false;
        var singleServer = "";
        if (args.length > 1) {
            runQuietly = args[1].toLowerCase() === 'true';
            if (args.length > 2) {
                Utils.parseServerName(Config,null,args[2],true,(serverName) => {
                    singleServer = serverName;
                    runSingle = true;
                });
                if (singleServer == undefined) {channel.send("The server you are trying to ban on does not exist!"); return;}
            }
        }
        if (runSingle) {
            Config.scheduleAction(Config.Actions.Ban.id, singleServer, username, runQuietly); //Send commands to servers
            Config.setupLog(discordClient, user, username, Config.Actions.Ban.id); //setup a log for this event
            channel.send(username + " has been banned!");
        } else {
            discordClient.Database.getServers(username,(servers) => {
                servers.forEach((serverName,_) => {
                    Config.scheduleAction(Config.Actions.Ban.id, serverName, username, runQuietly); //Send command to servers
                });
                Config.setupLog(discordClient, user, username, Config.Actions.Ban.id); //setup a log for this event
                channel.send(username + " has been banned!");
            });
        };
    });
}

module.exports = { run, argumentAmt };