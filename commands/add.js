const Utils = require("../Utils");
const Config = require("../Config");

const argumentAmt = {min:1,max:4};

function run(discordClient, isAdmin, highestRole, user, channel, args) { //Function to run
    Utils.parseUsername(args[0],channel,(username) => {
        discordClient.Database.getActiveUsernames(user.id,(usernames) => {
            if (usernames.length < Config.jsonRoles[highestRole].accounts || usernames.includes(username)) {
                discordClient.Database.isMcUsernameAvailable(username,(row) => {
                    var runQuietly, runSingle, runForce, checkAllServers = false;
                    var singleServer = "";
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
                            if (singleServer == null) {channel.send("You do not have permission to be whitelisted on this server!"); return;}
                            if (singleServer == undefined) {channel.send("The server you are trying to whitelist on does not exist!"); return;}
                        }
                    }
                    var countServers = 0;
                    var servers = row == null ? null : JSON.parse(row.Servers);
                    if (row == null || (row.DiscordId == user.id.toString() && (row.Active ? (runSingle ? (runForce || !servers.includes(singleServer)) : (checkAllServers = true)) : true))) {
                        if (row == null) {
                            discordClient.Database.setUsername(user.id,username,user.id); //Add user to the database
                        } else if (!row.Active) {
                            discordClient.Database.setActive(true,username); //Set username back to active
                        }
                        discordClient.Database.setHighestRole(user.id,highestRole); //Update the highest role here
                        if (runSingle) {
                            Config.scheduleAction(Config.Actions.Whitelist.id, singleServer, username, runQuietly); //Send commands to servers
                            countServers++;
                        } else {
                            Config.jsonRoles[highestRole].servers.forEach((serverName,_) => { //Send commands to all servers for role
                                if (servers == null || (checkAllServers && servers.includes(serverName))) {
                                    Config.scheduleAction(Config.Actions.Whitelist.id,serverName, username, runQuietly); //Send commands to servers
                                    countServers++;
                                }
                            });
                        }
                        if (countServers > 0) {
                            channel.send(username + " has been whitelisted");
                            Config.setupLog(discordClient, user, username, Config.Actions.Whitelist.id); //setup a log for this event
                        } else {
                            channel.send("You're already whitelisted on all the servers");
                        }
                    } else {
                        if (row.DiscordId != user.id.toString()) {
                            channel.send("This minecraft username is not owned by you!");
                        } else {
                            channel.send("This minecraft username is already whitelisted on "+(runSingle ? "this server!" : "these servers!"));
                        }
                    }
                });
            } else {channel.send("You've already used all your available whitelist spots!");}
        });
    });
}

module.exports = { run, argumentAmt };