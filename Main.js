process.title = "SCI"; //For easy shutdown

//Require Utils
const Utils = require("./Utils");
const util = require("util");

//Require Minecraft Protocol
const mc = require("minecraft-protocol"); // BOT Method
const RCON = require("./libs/RCON.js"); // RCON Method
const states = mc.states;

//Require & Initialize Discord.js
const Discord = require("discord.js");
const discordClient = new Discord.Client();

//Require Config
const Config = require("./Config");

//Require & Initialize Database
const Database = require("./Database");
Database.init();

let GuildOwner = null;

/*let client = mc.createClient({
    username: Config.bot_email, // The Email
    //password: Config.password, // The Password
    auth: "microsoft", // The Auth Type
    version: false, // Automatic Version Detection
    hideErrors: true //Can cause crash
});*/
let client = null;
let clientReady = true;
let curentServer = "";
let countServers = 0;
let databaseEntryList = []; // [entry (ServerAction), username (string), serverName (string)]

//Add commands
Config.cmdManager.getCommandList().forEach((key, _) => {
  Config.cmdManager.setFunction(key,require(`./commands/${key}`));
});

//Manually Added Commands
Config.cmdManager.addCommand("help",{description:"You are here!",usage:"help",run:sendHelpMsg});


//Config.cmdManager.printList();


function isOwnerAndAdmin(discordId) {
    return Config.options.ownerIsAnAdmin && (Config.guildId == 0 || GuildOwner == null) ? false : GuildOwner == discordId;
}

let rconServers = [];
if (Config.method == "rcon") {
	Object.keys(Config.servers).forEach((serverName, _) => {
		rconServers[serverName] = new RCON();
		const address = Config.servers[serverName].ip.split(":");
		rconServers[serverName].connect(address[0], address[1], Config.password).catch(error => { console.error(`An error occured: ${error}`);});
	});
}

if (Config.options.debugMode) {
    process.on('unhandledRejection', error => {
        console.error('Unhandled promise rejection:', error);
    });
}

function sendHelpMsg(_, isAdmin, highestRole, user, channel, args) {
    let generatedFields = [];
    Config.cmdManager.getCommandList().forEach((key, _) => {
        const command = Config.cmdManager.getCommand(key);
        if (!command.adminOnly || (command.adminOnly && isAdmin)) {
            if (isAdmin || Object.keys(Config.jsonRoles).indexOf(command.require) <= highestRole) {
                let usage = "";
                if (Array.isArray(command.usage)) {
                    let first = true;
                    command.usage.forEach((_, val) => {
                        usage += (first ? "" : "\n") + val;
                        first = false;
                    });
                } else {
                    usage = command.usage;
                }
                generatedFields.push({name: `${Config.prefix}whitelist `+usage, value: command.description});
            }
        }
    });
    channel.send(new Discord.MessageEmbed()
    .setColor("#7222d4")
    .setTitle("Whitelist Help")
    .setDescription("Commands accessible to you:")
    .addFields(generatedFields));
}

/**
 * Gets the index of the highest role which the user has in the jsonRoles list
 * @param {GuildMember} user - A GuildMember instance which belongs to a discord user
 * @returns {?number} - The index of the config.role list. Null if no role was found
 */
function getHighestRole(user) {
    for (const jsonRolekeys in Config.jsonRoles) {
        for (const role of user.roles.cache.map(x => x.id)) {
            if (user.roles.cache.get(role).id == Config.jsonRoles[jsonRolekeys].roleId) {
                return jsonRolekeys;
            }
	    }
    }
	return null;
}

const ServerAction = {
    addServer: 0,
    removeServer: 1,
    addWaiting: 2,
    removeWaiting: 3
}

function updateDatabaseEntries(databaseEntryListt) {
    const item = databaseEntryListt.shift();
    if (item != undefined && item != null) {
        if (item.entry == ServerAction.addServer) {
            Database.addServer(item.username,item.server,() => {
                updateDatabaseEntries(databaseEntryListt);
            });
        } else if (item.entry == ServerAction.removeServer) {
            Database.removeServer(item.username,item.server,() => {
                updateDatabaseEntries(databaseEntryListt);
            });
        } else if (item.entry == ServerAction.addWaiting) {
            Database.addWaiting(item.data,item.username,item.server,item.silent,() => {
                updateDatabaseEntries(databaseEntryListt);
            });
        } else if (item.entry == ServerAction.removeWaiting) {
            Database.removeWaiting(item.data,item.username,item.server,item.silent,() => {
                updateDatabaseEntries(databaseEntryListt);
            });
        }
    }
}


/**
 * Attempt to run all commands in Queue
 */
async function runCommands() { //Needs another rewrite xD
    countServers = 0;
    databaseEntryList = []; // [entry (ServerAction), username (string), serverName (string)]
    Object.keys(Config.servers).forEach((serverName, _) => {
        if (Config.options.debugMode) { //debugging without needing the bot
            let serverActions = Config.actionQueue[serverName];
            let customServerActions = Config.customActionQueue[serverName];
            if (serverActions.length > 0 || customServerActions.length > 0) {
                if (false) { // Test Waiting
                    if (Config.options.verbose) {
                        console.log(`${serverName} - Server Down!`);
                    }
                    while(serverActions.length > 0) {
                        let action = serverActions.pop();
                        databaseEntryList.push({entry:ServerAction.addWaiting,username:action.username,server:serverName,data:action.action,silent:(action.silent == null) ? false : action.silent});
                    }
                    //Custom commands do not get saved to run later - Add a message to user later (although why are they executing commands on a server that's offline?)
                    customServerActions = [];
                    if (++countServers == Config.serverCount && databaseEntryList.length > 0) {
                        updateDatabaseEntries(databaseEntryList);
                    }
                }
                setTimeout(() => {
                    while(serverActions.length > 0) {
                        let action = serverActions.pop();
                        if (Config.Actions[action.action] != null) {
                            const theAction = Config.Actions[action.action];
                            if (Config.options.verbose) {
                                console.log(`${serverName} - ${util.format(theAction.cmd, action.username)}`);
                            }
                            if (Config.options.verbose && !action.silent) console.log(`chat - ${util.format(theAction.msg, action.username)}`);
                            Config.modifyLog(discordClient,action,serverName);
                            if (theAction.entry != null && ServerAction[theAction.entry] != null) {
                                databaseEntryList.push({entry:ServerAction[theAction.entry],username:action.username,server:serverName});
                            }
                        }
                    }
                    while(customServerActions.length > 0) {
                        const action = customServerActions.pop();
                        if (Config.Actions[action.action] != null) {
                            if (Config.options.verbose) {
                                console.log(`${serverName} - ${action.command}`);
                                console.log(`chat - ${util.format(Config.Actions[action.action].msg, action.username)}`);
                            }
                        }
                    }
                    if (++countServers == Config.serverCount && databaseEntryList.length > 0) {
                        updateDatabaseEntries(databaseEntryList);
                    }
                }, Config.options.joiningExecutionDelay);
            } else {
                if (++countServers == Config.serverCount && databaseEntryList.length > 0) {
                    updateDatabaseEntries(databaseEntryList);
                }
            }
        } else if (clientReady) {
            if (Config.method == "bot") {
                if (serverActions.length > 0 || customServerActions.length > 0) {
                    const address = Config.servers[serverName].ip.split(":");
                    if (typeof address[1] == "undefined" || address[1] == null) {address[1] == "25565";} // If its an url with no port, use default
                    mc.ping({host: address[0],port: parseInt(address[1])}, (err, _) => {
                        if (err) { // If server is down, we add it to that players waiting list
                            if (Config.options.verbose) {
                                console.log(`${serverName} - Server Down!`);
                            }
                            while(serverActions.length > 0) {
                                let action = serverActions.pop();
                                databaseEntryList.push({entry:ServerAction.addWaiting,username:action.username,server:serverName,data:action.action,silent:action.silent});
                            }
                            //Custom commands do not get saved to run later - Add a message to user later (although why are they executing commands on a server that's offline?)
                            customServerActions = [];
                            if (++countServers == Config.serverCount && databaseEntryList.length > 0) {
                                updateDatabaseEntries(databaseEntryList);
                            }
                        } else if (clientReady) {
                            clientReady = false;
                            curentServer = serverName;
                            client = mc.createClient({
                                host:address[0],
                                port:address[1],
                                username: Config.bot_email,
                                password: Config.password,
                                auth: Config.bot_type, // The Auth Type
                                version: false, // Automatic Version Detection
                                hideErrors: true //Can cause crash
                            });
                            client.on("login", _ => { //Only executes command after having connected for atleast 500ms, to make sure player is fully loaded
                                setTimeout(() => {
                                    const serverActions = Config.actionQueue[curentServer];
                                    const customServerActions = Config.customActionQueue[curentServer];
                                    while(serverActions.length > 0) {
                                        const action = serverActions.pop();
                                        if (Config.Actions[action.action] != null) {
                                            const theAction = Config.Actions[action.action];
                                            const cmd = util.format(theAction.cmd, action.username);
                                            client.write("chat", {message: cmd});
                                            if (Config.options.verbose) {
                                                console.log(`${curentServer} - ${cmd}`);
                                            }
                                            if (!action.silent) client.write("chat", {message: util.format(theAction.msg, action.username)});
                                            Config.modifyLog(discordClient,action,curentServer);
                                            if (theAction.entry != null && ServerAction[theAction.entry] != null) {
                                                databaseEntryList.push({entry:ServerAction[theAction.entry],username:action.username,server:curentServer});
                                            }
                                        }
                                    }
                                    while(customServerActions.length > 0) {
                                        const action = customServerActions.pop();
                                        if (Config.Actions[action.action] != null) {
                                            client.write("chat", {message: action.command});
                                            if (Config.options.verbose) {
                                                console.log(`${curentServer} - ${action.command}`);
                                            }
                                        }
                                    }
                                    if (++countServers == Config.serverCount && databaseEntryList.length > 0) {
                                        updateDatabaseEntries(databaseEntryList);
                                    }
                                    setTimeout(() => {
                                        client.write('disconnect');
                                    }, Config.options.exitingExecutionDelay); //delay the bot exiting the server to make sure command makes it. Rare cases can cause issues which this prevents
                                }, Config.options.joiningExecutionDelay);
                            });
                            client.on('disconnect', function (packet) {
                                clientReady = true;
                                runCommands();
                            });
                            client.on('error', function (err) {
                                clientReady = true;
                                runCommands();
                            });
                        }
                    });
                } else {
                    if (++countServers == Config.serverCount && databaseEntryList.length > 0) {
                        updateDatabaseEntries(databaseEntryList);
                    }
                }
            } else if (Config.method == "rcon") {
                let serverActions = Config.actionQueue[serverName];
                let customServerActions = Config.customActionQueue[serverName];
                if (rconServers[serverName] != null) {
                    const address = Config.servers[serverName].ip.split(":");
                    if (typeof address[1] == "undefined" || address[1] == null) {address[1] == "25565";}
                    mc.ping({host: address[0],port: parseInt(address[1])}, (err, _) => {
                        if (err) { // If server is down, we add it to that players waiting list
                            if (Config.options.verbose) {
                                console.log(`${serverName} - Server Down!`);
                            }
                            while(serverActions.length > 0) {
                                const action = serverActions.pop();
                                databaseEntryList.push({entry:ServerAction.addWaiting,username:action.username,server:serverName,data:action.action});
                            }
                            //Custom commands do not get saved to run later - Add a message to user later (although why are they executing commands on a server that's offline?)
                            customServerActions = [];
                            if (++countServers == Config.serverCount && databaseEntryList.length > 0) {
                                updateDatabaseEntries(databaseEntryList);
                            }
                        } else {
                            const rconServer = rconServers[serverName];
                            while(serverActions.length > 0) {
                                const action = serverActions.pop();
                                if (Config.Actions[action.action] != null) {
                                    const theAction = Config.Actions[action.action];
                                    const cmd = util.format(theAction.cmd, action.username);
                                    rconServer.send(cmd)
                                        .then(response => { if (Config.options.verbose) {console.log(response);}})
                                        .catch(error => { console.error(`An error occured: ${error}`);});
                                    
                                    if (!action.silent) {
                                        rconServer.send(`/say ${util.format(theAction.msg, action.username)}`)
                                            .then(response => { if (Config.options.verbose) {console.log(response);}})
                                            .catch(error => { console.error(`An error occured: ${error}`);});
                                    }
                                    if (Config.options.verbose) {
                                        console.log(`${serverName} - ${cmd}`);
                                    }
                                    Config.modifyLog(discordClient,action,serverName);
                                    if (theAction.entry != null && ServerAction[theAction.entry] != null) {
                                        databaseEntryList.push({entry:ServerAction[theAction.entry],username:action.username,server:serverName});
                                    }
                                }
                            }
                            while(customServerActions.length > 0) {
                                const action = customServerActions.pop();
                                if (Config.Actions[action.action] != null) {
                                    rconServer.send(action.command)
                                        .then(response => { if (Config.options.verbose) {console.log(response);}})
                                        .catch(error => { console.error(`An error occured: ${error}`);});
                                    if (Config.options.verbose) {console.log(`${serverName} - ${action.command}`);}
                                }
                            }
                            if (++countServers == Config.serverCount && databaseEntryList.length > 0) {
                                updateDatabaseEntries(databaseEntryList);
                            }
                        }
                    });
                } else if (++countServers == Config.serverCount && databaseEntryList.length > 0) {
                    updateDatabaseEntries(databaseEntryList);
                }
            }
        }
    });
}

discordClient.runCommands = runCommands;
discordClient.Database = Database;
discordClient.experimentalReload = () => {
    Object.keys(require.cache).forEach(key => delete require.cache[key]);
}

discordClient.on("message", msg => {
    if (msg.author.bot || !msg.content.startsWith(Config.prefix)) return; //Command can't be run by a bot && must be a valid command

    const isAdmin = Utils.hasRole(msg.member, Config.adminRole) || isOwnerAndAdmin(msg.member.id);

    if (isAdmin && msg.content.startsWith(Config.prefix + "restart")) { // The restart commands, only admins can use this. The auto-restart script will do the rest!
        discordClient.end();
        return;
    }

    let args = msg.content.split(" ");
    if (!args.shift().match(Config.prefix + "whitelist")) return; //Command MUST start with whitelist

    let hasChannelPerms = false;
    Object.keys(Config.jsonRoles).forEach((role,_) => {
        if (Utils.hasRole(msg.member,Config.jsonRoles[role].roleId)) {
            if (Config.jsonRoles[role].channel == -1 || msg.channel.id == Config.jsonRoles[role].channel) {    // Channel -1 mean anywhere
                hasChannelPerms = true;
            }
        }
    });
    if (!(isAdmin && msg.channel.id == Config.botTestingChannel) && !hasChannelPerms) return; // User must have perms to write bot commands in this channel

    const userCommand = args.shift()?.toLowerCase();
    if (userCommand != undefined && Config.cmdManager.doesExist(userCommand)) {
        const command = Config.cmdManager.getCommand(userCommand);
        if (command.enabled) {
            if (!command.adminOnly || (command.adminOnly && isAdmin)) {
                const highestRole = getHighestRole(msg.member);
                if (Config.jsonRoles[highestRole]) {
                    if (isAdmin || command.require == "" || Object.keys(Config.jsonRoles).indexOf(command.require) >= Object.keys(Config.jsonRoles).indexOf(highestRole)) {
                        if ((command.argumentAmt.min == -1 || args.length >= command.argumentAmt.min) && (command.argumentAmt.max == -1 || args.length <= command.argumentAmt.max)) {
                            command.func(discordClient, isAdmin, highestRole, msg.member, msg.channel, args);
                        } else {msg.channel.send(`Incorrect arguments used for the command. Usage: \`${Config.prefix}whitelist ${command.usage}\``);}
                    } else {msg.channel.send("You do not have the required role to use this command");}
                } else {msg.channel.send("Roles where not correctly configured, your role was not recognized!");}
            } else {msg.channel.send("This command can only be run by admins");}
        } else {msg.channel.send("This command is currently disabled!");}
    } else {msg.channel.send("That command does not exist");}
});

function onMemberChange(newMember, oldHighestRole,newHighestRole) {
    if (Config.options.disableRoleChangeChecks) return;
	if (oldHighestRole != null) { //Had a role before
        Database.setHighestRole(newMember.id,newHighestRole);
		if (newHighestRole == null) { //User no longer has any roles. Start the mass un-whitelist
            Database.getActiveUsernames(newMember.id,(usernames) => { //un-whitelist all active accounts from all servers
                usernames.forEach((username) => {
                    Database.getServers(username, (servers) => {
                        servers.forEach((server) => {
                            Config.scheduleAction(Config.Actions.Unwhitelist.id, server, username, Config.options.WhitelistAutomaticallyQuietly); //Send commands to server
                        });
                        Config.setupLog(discordClient, newMember, username, Config.Actions.Unwhitelist.id); //setup a log for this event
                    });
                    Database.setActive(false,username);
                });
            });
        } else if (oldHighestRole != newHighestRole) { //If the role changed
            if (Object.keys(Config.jsonRoles).indexOf(oldHighestRole) > Object.keys(Config.jsonRoles).indexOf(newHighestRole)) { //User upgraded roles
                Database.getActiveUsernames(newMember.id,(accounts) => {//whitelist on new servers
                    const serversToAdd = Config.jsonRoles[newHighestRole].servers.filter(serv => !Config.jsonRoles[oldHighestRole].servers.includes(serv));
                    accounts.forEach((username) => {
                        serversToAdd.forEach((serverName) => { // Loop through all servers they had access to
                            Config.scheduleAction(Config.Actions.Whitelist.id, serverName, username, Config.options.WhitelistAutomaticallyQuietly); //Send commands to server
                        });
                        if (serversToAdd.length > 0) {
                            Config.setupLog(discordClient, newMember, username, Config.Actions.Whitelist.id); //setup a log for this event
                        }
                    });
                    if (Config.options.ReWhitelistAutomatically && accounts.length < Config.jsonRoles[newHighestRole].accounts) { //If should rewhitelist automatically
                        Database.getInActiveUsernames(newMember.id,Config.jsonRoles[newHighestRole].accounts-accounts.length,(inactiveAccounts) => {
                            inactiveAccounts.forEach((username) => {
                                Config.jsonRoles[newHighestRole].servers.forEach((serverName,_) => { //Send commands to all servers for role
                                    Config.scheduleAction(Config.Actions.Whitelist.id,serverName, username, Config.options.WhitelistAutomaticallyQuietly); //Send commands to servers
                                });
                                Config.setupLog(discordClient, newMember, username, Config.Actions.Whitelist.id); //setup a log for this event
                            });
                        });
                    }
                });
            } else { //User downgraded roles
                Database.getActiveUsernames(newMember.id,(accounts) => {
                    const amtActive = accounts.length;
                    if (amtActive > Config.jsonRoles[newHighestRole].accounts) {
                        Database.getAccountsOverLimit(newMember.id,amtActive-Config.jsonRoles[newHighestRole].accounts,(accountsToRemove) => {
                            accountsToRemove.forEach((username) => {
                                Database.getServers(username,(serversToRemove) => {
                                    serversToRemove.forEach((serverName,_) => {
                                        Config.scheduleAction(Config.Actions.Unwhitelist.id,serverName, username, Config.options.WhitelistAutomaticallyQuietly); //Send commands to server
                                    });
                                    if (serversToRemove.length > 0) {
                                        Config.setupLog(discordClient, newMember, username, Config.Actions.Unwhitelist.id); //setup a log for this event
                                    }
                                });
                            });
                            const serversToRemove = Config.jsonRoles[oldHighestRole].servers.filter(serv => !Config.jsonRoles[newHighestRole].servers.includes(serv));
                            accounts.filter(acct => !accountsToRemove.includes(acct)).forEach((username) => {
                                serversToRemove.forEach((serverName) => { // Loop through all servers they had access to
                                    Config.scheduleAction(Config.Actions.Unwhitelist.id, serverName, username, Config.options.WhitelistAutomaticallyQuietly); //Send commands to server
                                });
                                if (serversToRemove.length > 0) {
                                    Config.setupLog(discordClient, newMember, username, Config.Actions.Unwhitelist.id); //setup a log for this event
                                }
                            });
                        });
                    } else {//No accounts over limit
                        //remove servers that you no longer have access to for accounts
                        const serversToRemove = Config.jsonRoles[oldHighestRole].servers.filter(serv => !Config.jsonRoles[newHighestRole].servers.includes(serv));
                        accounts.forEach((username) => {
                            serversToRemove.forEach((serverName) => { // Loop through all servers they had access to
                                Config.scheduleAction(Config.Actions.Unwhitelist.id, serverName, username, Config.options.WhitelistAutomaticallyQuietly); //Send commands to server
                            });
                            if (serversToRemove.length > 0) {
                                Config.setupLog(discordClient, newMember, username, Config.Actions.Unwhitelist.id); //setup a log for this event
                            }
                        });
                    }
                });
            }
        }
    } else {
        if (newHighestRole != null) {
            Database.setHighestRole(newMember.id,newHighestRole);
            if (Config.options.ReWhitelistAutomatically) { //If should rewhitelist automatically
                Database.getInActiveUsernames(newMember.id,Config.jsonRoles[newHighestRole].accounts,(inactiveAccounts) => {
                    inactiveAccounts.forEach((username) => {
                        Config.jsonRoles[newHighestRole].servers.forEach((serverName,_) => { //Send commands to all servers for role
                            Config.scheduleAction(Config.Actions.Whitelist.id,serverName, username, Config.options.WhitelistAutomaticallyQuietly); //Send commands to servers
                        });
                        Database.setActiveCallback(true,username,() => {
                            Config.setupLog(discordClient, newMember, username, Config.Actions.Whitelist.id); //setup a log for this event
                        });
                    });
                });
            }
        }
    }
}

discordClient.on("guildMemberUpdate",(oldMember,newMember) => {
    if (Config.options.disableRoleChangeChecks) return;
    onMemberChange(newMember,getHighestRole(oldMember),getHighestRole(newMember));
});

discordClient.on("guildMemberRemove", (member) => {
    onMemberChange(member,getHighestRole(member.id),null);
    Database.removeHighestRole(member.id); //Don't wanna loop through people who are not here
});

function roleCheck() {
    Database.forEachHighestRole(obj => {
        if (Config.guildId != 0) {
            const guild = discordClient.guilds.cache.get(Config.guildId);
            if (guild.member(obj.DiscordId)) {
                guild.members.fetch(obj.DiscordId).then(member => {
                    onMemberChange(member,obj.HighestRole,getHighestRole(member));
                }).catch(console.log);
            }
        }
    });
}

function pingEveryHour() {
    let serverStatusCache = []; //{boolean[]}
    Database.forEachWaiting((username,obj) => { //obj = [action,server,quietly]
        const server = obj[1];
        if (Config.options.debugMode || serverStatusCache[server] != null) { //already been cached
            if (Config.options.debugMode || serverStatusCache[server]) { //If server online
                Config.scheduleAction(obj[0], server, username, obj[2]); //Send commands to servers
                Config.setupLog(discordClient, null, username, Config.Actions.Whitelist.id); //setup a log for this event
            }
        } else if (Config.servers[server] != null) { //cache it
            let address = Config.servers[server].ip.split(":");
            if (typeof address[1] == "undefined" || address[1] == null) {address[1] == "25565";}
            mc.ping({host: address[0],port: parseInt(address[1])}, (err, _) => { //If the server is now online
                if (err) {
                    serverStatusCache[server] = false;
                } else {
                    serverStatusCache[server] = true;
                    Config.scheduleAction(obj[0], server, username, obj[2]); //Send commands to servers
                    Config.setupLog(discordClient, null, username, Config.Actions.Whitelist.id); //setup a log for this event
                }
            });
        }
    });
    Config.updateLog();
}


//Setup discord bot
discordClient.on("ready", () => {
	console.log(`Logged in as ${discordClient.user.tag}!`);
	discordClient.user.setActivity(`Minecraft | ${Config.prefix}whitelist help`, { type: 'PLAYING' })
	.then(presence => console.log(`Activity set to: PLAYING ${presence.activities[0].name}`))
	.catch(console.error);
    if (Config.guildId != 0) {
        discordClient.guilds.fetch(Config.guildId).then(guild => {
            GuildOwner = guild.ownerID;
        });
    }
    if (Config.options.sendMessageOnStartup) {
        if (Config.whitelistLog) {
            discordClient.channels.fetch(Config.whitelistLog).then(channel => {return channel.send(new Discord.MessageEmbed().setColor("#00FF00").setTitle("Startup").setDescription("WhitelistManager just started!"));});
        }
    }

    pingEveryHour(); //Do at startup
    setInterval(pingEveryHour, 3600000); // Will check if anyone is waiting, if they are then it will ping to see if the server is online

    // Whenever the bot comes back up, check if someone lost there role during the downtime.
    setTimeout(roleCheck, 60000); // Do this 2 min after restarting bot, so the bot has time to relax. It does a lot on startup xD
});

//Login with token
discordClient.login(Config.TOKEN);
