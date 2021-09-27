const https = require('https');

function parseUsername(username, channel, callback) {
    if (username.length <= 16) {
        const removeQuoteUsername = username.replace(/^"|"$/g, '');
        if (removeQuoteUsername === removeQuoteUsername.replace(/[^\w\s_]/gi,'')) {
            https.get("https://api.mojang.com/users/profiles/minecraft/" + username, (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        callback(JSON.parse(body).name); //Use mojang username as entry
                    } else {channel.send("This is not a valid username or this username does not exist!");}
                });
            });
        } else {channel.send("Your username cannot contain any special characters except `_`");}
    } else {channel.send("Your username cannot be longer then 16 characters!");}
}

module.exports = {

    getUserOrUsername: (argument,channel,callbackUser,callbackUsername) => {
        if (!argument) return;
        if (argument.startsWith('<@') && argument.endsWith('>')) {
            argument = argument.slice(2, -1);
            if (argument.startsWith('!')) {
                argument = argument.slice(1);
            }
            if (!argument.startsWith('&')) {
                callbackUser(argument);
            } else {
                channel.send("A role tag was passed instead of a user tag!");
            }
        } else {
            parseUsername(argument,channel,callbackUsername);
        }
    },
  
    parseUsername,

    getUserFromMention: (mention) => {
        if (!mention) return null;
        if (mention.startsWith('<@') && mention.endsWith('>')) {
            mention = mention.slice(2, -1);
            if (mention.startsWith('!')) {
                mention = mention.slice(1);
            }
            if (mention.startsWith('&')) return 0;
            return mention;
        }
        return null;
    },

    usernameToUUID: (username, callback) => {
        https.get("https://api.mojang.com/users/profiles/minecraft/" + username, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                callback(res.statusCode === 200 ? JSON.parse(body).id : 0);
            });
        });
    },

    parseServerName: (Config,highestRole,serverInput,force,callback) => {
        if (serverInput == '*') return; //Just whitelist on all the servers that this person is allowed to be whitelisted on!
        const serverName = Object.keys(Config.servers).find(serverName => serverInput.toLowerCase() === serverName.toLowerCase());
        callback(typeof serverName == "undefined" ? undefined : ((force || Config.jsonRoles[highestRole].servers.includes(serverName)) ? serverName : null));
    },

    /**
    * Checks if a discord user has a role
    * @param {GuildMember} user - A GuildMember instance which belongs to a discord user
    * @param {number} theRole - The RoleId of the role you want to check if the player has
    * @returns {boolean} - True if the user has the role, false if it does not
    */
     hasRole: (user, theRole) => {
        for (const role of user.roles.cache.map(x => x.id)) {
            if (user.roles.cache.get(role).id == theRole) {
                return true;
            }
        }
        return false;
    }
};