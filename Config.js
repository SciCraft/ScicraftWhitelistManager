const fs = require("fs");
const yaml = require('js-yaml');

const jsTest = /\.js$/;

var doc;
try {
    doc = yaml.load(fs.readFileSync('./config.yaml', 'utf8'));
    console.log(doc);
} catch (e) {
    console.log(e);
}
const config = doc;

const Discord = require("discord.js");

const prefix = config.prefix || "&";
const servers = config.servers || [];


//const patreonRole = config.patreonRole || 0;
const method = config.method || "bot";
const adminRole = config.adminRole || 0;
const jsonRoles = config.roles || {};
const whitelistLog = config.whitelistLog || null;
const botTestingChannel = config.botTestingChannel || null;

const guildId = config.guildId || 0;

const config_commands = config.commands || {};

const options = {
    verbose : config.options.verbose || false,
    debugMode : config.options.debugMode || false,
    ReWhitelistAutomatically: config.options.ReWhitelistAutomatically || false,
    WhitelistAutomaticallyQuietly: config.options.WhitelistAutomaticallyQuietly || false,
    joiningExecutionDelay: config.options.joiningExecutionDelay || 500,
    exitingExecutionDelay: config.options.exitingExecutionDelay || 1000,
    disableRoleChangeChecks: config.options.disableRoleChangeChecks || false,
    ownerIsAnAdmin: config.options.ownerIsAnAdmin || true,
    sendMessageOnStartup: config.options.sendMessageOnStartup || true
};

//Add all options that are not pre-made here. So that custom options can be used. Or Make a customOption category


const bot_email = config.bot.email || process.env.SECRET_EMAIL || "";
const bot_password = config.bot.password || process.env.SECRET_PASSWORD || "";

const serverCount = Object.keys(servers).length;

const TOKEN = config.token || process.env.SECRET_TOKEN || "";

const Actions = config.actions || {}; //Actions to run

//Make sure all the absolutly needed values are set. To make sure they not null (unfortunatly I have to do this cause idiots exist)
Actions.Whitelist = {
    log: Actions.Whitelist.log || true,
    cmd: Actions.Whitelist.cmd || "/whitelist add %s",
    msg: Actions.Whitelist.msg || "Added: %s to the whitelist",
    col: Actions.Whitelist.col || "#00DD00",
    inf: Actions.Whitelist.inf || "was whitelisted on",
    entry:"addServer"
};
Actions.Unwhitelist = {
    log: Actions.Unwhitelist.log || true,
    cmd: Actions.Unwhitelist.cmd || "/whitelist remove %s",
    msg: Actions.Unwhitelist.msg || "Removed: %s from the whitelist",
    col: Actions.Unwhitelist.col || "#DD0000",
    inf: Actions.Unwhitelist.inf || "was un-whitelisted from",
    entry:"removeServer"
};
Actions.Kick = {
    log: Actions.Kick.log || false,
    cmd: Actions.Kick.cmd || "/kick %s",
    msg: Actions.Kick.msg || "Kicked: %s",
    col: Actions.Kick.col || "#880000",
    inf: Actions.Kick.inf || "was kicked on"
};
Actions.Ban = {
    log: Actions.Ban.log || true,
    cmd: Actions.Ban.cmd || "/ban %s",
    msg: Actions.Ban.msg || "Banned: %s",
    col: Actions.Ban.col || "#FF0000",
    inf: Actions.Ban.inf || "was banned on"
};
Actions.Pardon = {
    log: Actions.Pardon.log || true,
    cmd: Actions.Pardon.cmd || "/pardon %s",
    msg: Actions.Pardon.msg || "Pardoned: %s",
    col: Actions.Pardon.col || "#00FF00",
    inf: Actions.Pardon.inf || "was pardoned on"
};
Actions.Op = {
    log: Actions.Op.log || true,
    cmd: Actions.Op.cmd || "/op %s",
    msg: Actions.Op.msg || "Opped: %s",
    col: Actions.Op.col || "#8A2BE2",
    inf: Actions.Op.inf || "was opped on"
};
Actions.Custom = {
    log: Actions.Custom.log || false,
    cmd: Actions.Custom.cmd,
    msg: Actions.Custom.msg,
    col: Actions.Custom.col || "#2222EE",
    inf: Actions.Custom.inf || "did custom operation on"
};


Object.keys(Actions).forEach((actionName, _) => { //Set action id's
    Actions[actionName].id = actionName;
});


var commandList = [];

try {
    commandList = fs.readdirSync("./commands");
} catch(e) {
    console.log(e);
}

let commands = {};

//Command Parser
commandList.forEach((name, _) => {
    if (jsTest.test(name)) {
        name = name.replace(jsTest,'').toLowerCase();
        if (config_commands.hasOwnProperty(name) && !commands[name]) {
            commands[name] = {
                require: config_commands[name].require || "",
                adminOnly: config_commands[name].adminOnly || false,
                description: config_commands[name].description || "",
                usage: config_commands[name].usage || "",
                enabled: config_commands[name].enabled || true
            }
        }
    }
});

let cmdManager = {
    getCommand: (name) => {
        return commands[name];
    },
    addCommand: (name,data) => {
        commands[name] = {
            require: data.require || "",
            adminOnly: data.adminOnly || false,
            description: data.description || "",
            usage: data.usage || "",
            enabled: data.enabled || true,
            func: data.run,
            argumentAmt: data.argumentAmt || {min:0,max:0}
        }
    },
    getCommandList: () => {
        return Object.keys(commands);
    },
    doesExist: (name) => {
        return commands.hasOwnProperty(name);
    },
    setFunction: (name,func) => {
        commands[name].func = func.run;
        commands[name].argumentAmt = func.argumentAmt || {min:0,max:0};
    },
    printList: () => {
        console.log(commands);
    }
}

var actionQueue = []; // Server: [Action, Username, Silent]
var customActionQueue = []; // Server: [Action, Username, Command, Silent]

var whitelistLogCache = []; // username: [action, msgRef, time]

Object.keys(servers).forEach((serverName, _) => {
    if (servers[serverName].ip == null || servers[serverName].ip == "") {
        delete servers[serverName];
        console.warn("Removed server: "+serverName+" - For having an invalid IP!");
    } else {
        servers[serverName] = {
            ip: servers[serverName].ip || warnMissingIp(),
            isCreative: servers[serverName].isCreative || false,
            shouldOp: servers[serverName].shouldOp || false,
            opRole: servers[serverName].opRole || null
        };
        actionQueue[serverName] = [];
        customActionQueue[serverName] = [];
    }
});

/**
 * Schedule an action on a server
 * @param {string} action - The action to perform on a server
 * @param {string} server - The server name which needs to run the operation
 * @param {string} username - The minecraft username of the user
 * @param {boolean} silent - If the bot should tell people on the minecraft servers what its doing
 */
function scheduleAction(action, server, username, silent) {
    actionQueue[server].push({action: action,username: username,silent: silent});
}

/**
 * Schedule a custom action on a server
 * @param {string} action - The action to perform on a server
 * @param {string} server - The server name which needs to run the operation
 * @param {string} command - The custom command to send
 */
 function scheduleCustomAction(action, server, command) {
    customActionQueue[server].push({action: action,command: command});
}

function shouldLogAction(action) {
    return Actions[action] != null ? Actions[action].log : false;
}

function createLog(discordClient, user, username, action) {
	if (whitelistLog && shouldLogAction(action)) {
		var description, color = "";
        if (Actions[action] != null) {
            descrition = Actions[action].inf || "";
            color = Actions[action].col || "#000000";
        }
		const logEmbed = new Discord.MessageEmbed().setColor(color).setTitle(username).setDescription(description);
        if (user != null) {
            logEmbed.setFooter(user.user.tag, user.user.displayAvatarURL());
        } else {
            logEmbed.setFooter("Was Waiting!");
        }
        return {msg: discordClient.channels.fetch(whitelistLog).then(channel => {return channel.send(logEmbed);}), desc: description};
	}
}

function setupLog(discordClient, user, username, action) {
    if (whitelistLog && shouldLogAction(action) && (whitelistLogCache[username] == null || (whitelistLogCache[username] != null && whitelistLogCache[username].action != action))) {
        var data = createLog(discordClient, user, username, action);
        whitelistLogCache[username] = {action:action,msg:data.msg, desc:data.desc, time: Date.now()};
    }
    if (discordClient != null) {
        discordClient.runCommands();
    }
}

async function modifyLog(discordClient, action, server) {
	if (!whitelistLog || !shouldLogAction(action.action) || action.username == null) return;
    if (whitelistLogCache[action.username] != null && whitelistLogCache[action.username].action == action.action) { //If cached
        var data = whitelistLogCache[action.username];
        await data.msg.then((message) => {
            var lastEmbed = message.embeds[0];
            var lastDesc = data.desc;
            var newDesc = lastDesc;
            if (lastDesc.endsWith("`")) {
                newDesc += `,\`${server}\``;
            } else {
                newDesc += ` \`${server}\``;
            }
            data.desc = newDesc;
            const logEmbed = new Discord.MessageEmbed().setColor(lastEmbed.color).setTitle(lastEmbed.title).setDescription(newDesc).setFooter(lastEmbed.footer.text,lastEmbed.footer.iconUrl);
            message.edit(logEmbed);
        });
    } else {
        discordClient.Database.getDiscordId(action.username,(discordId) => { //If its not cached then make a cache for it
            discordClient.users.fetch(discordId).then(user => {
                var data = createLog(discordClient, {user:user}, action.username, action.action);
                whitelistLogCache[action.username] = {action: action.action, msg: data.msg, desc: data.desc, time: Date.now()};
                modifyLog(discordClient, action, server);
            });
        });
    }
}

function modifyWaitingLog(username, server) { //To be implemented
	/*if (!whitelistLog || whitelistLogCache[username] == null) return;
    var message = whitelistLogCache[username].msg;
    var firstEmbed = message.embeds[0];
    var newWarningDesc = "";
    if (message.embeds.length > 1) {
        newWarningDesc = message.embeds[1].description+",`"+server+"`"
    } else {
        newWarningDesc = "`"+server+"`";
    }
	const logEmbed = new Discord.MessageEmbed(firstEmbed);
    const warningEmbed = new Discord.MessageEmbed().setColor("#eed202").setDescription(newWarningDesc);
    message.edit({embeds:[logEmbed,warningEmbed]});*/
}

//Execute every hour
function updateLog() {
    whitelistLogCache.filter(element => (Date.now()-element.time) < 900000);
}


module.exports = { prefix, method, servers, adminRole, jsonRoles, cmdManager, whitelistLog, botTestingChannel, bot_email, bot_password, Actions, scheduleAction, scheduleCustomAction, actionQueue, customActionQueue, setupLog, updateLog, modifyLog, modifyWaitingLog, guildId, serverCount, options, TOKEN };