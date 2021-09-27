const Utils = require("../Utils");
const Config = require("../Config");

const argumentAmt = {min:1,max:4};

function run(discordClient, isAdmin, highestRole, user, channel, args) { //Function to run
    Utils.parseUsername(args[0],channel,(username) => {
        discordClient.Database.getActiveUsernames(user.id,(usernames) => {
            if (usernames.includes(username)) {
                discordClient.Database.isMcUsernameAvailable(username,(row) => {
                    if (row == null) {channel.send("This account has not been registered yet!"); return;}
                    let runQuietly, runSingle, runForce = false;
                    let singleServer = "";
                    if (args.length > 1) {
                        if (!isAdmin) {channel.send("The Optional arguments for this command can only be used by Admins!"); return;}
                        runQuietly = args[1].toLowerCase() === 'true';
                        if (args.length > 2) {
                            if (args.length > 3) { //Force option
                                runForce = args[3].toLowerCase() === 'true';
                            }
                            Utils.parseServerName(Config,highestRole,args[2],runForce,(serverName) => {
                                singleServer = serverName;
                                runSingle = true;
                            });
                            if (singleServer == null) {channel.send("You do not have permission to be un-whitelisted on this server!"); return;}
                            if (singleServer == undefined) {channel.send("The server you are trying to un-whitelist on does not exist!"); return;}
                        }
                    }
                    const servers = JSON.parse(row.Servers);
                    if (row.DiscordId == user.id.toString() && (runSingle ? (runForce || servers.includes(singleServer)) : true)) {
                        if (runSingle) {
                            Config.scheduleAction(Config.Actions.Unwhitelist.id, singleServer, username, runQuietly); //Send commands to servers
                            channel.send(username + " has been un-whitelisted");
                            Config.setupLog(discordClient, user, username, Config.Actions.Unwhitelist.id);
                        } else {
                            let countServers = 0;
                            discordClient.Database.setActive(false,username);
                            Config.jsonRoles[highestRole].servers.forEach((serverName,_) => { //Send commands to all servers for role
                                if (servers != null && (runForce || servers.includes(serverName))) {
                                    Config.scheduleAction(Config.Actions.Unwhitelist.id,serverName, username, runQuietly); //Send commands to servers
                                    countServers++;
                                }
                            });
                            if (countServers > 0) {
                                channel.send(username + " has been un-whitelisted");
                                Config.setupLog(discordClient, user, username, Config.Actions.Unwhitelist.id); //setup a log for this event
                            } else {
                                channel.send("You're already un-whitelisted on all the servers");
                            }
                        }
                    } else {
                        if (row.DiscordId != user.id.toString()) {
                            channel.send("This minecraft username is not owned by you!");
                        } else {
                            channel.send("This minecraft username is already un-whitelisted on "+(runSingle ? "this server!" : "these servers!"));
                        }
                    }
                });
            } else {channel.send("This account has not been registered yet!");}
        });
    });
}

module.exports = { run, argumentAmt };