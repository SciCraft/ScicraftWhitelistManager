const logger = require("./Logger");
const {Actions,files} = require("./Config");

const sqlite3 = require("sqlite3").verbose();
let db = new sqlite3.Database(files.database, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, err => {
	if (err) { logger.error(err.message); }
    logger.log('verbose',"Connected to the whitelist database.");
});

function init() {
    //db.run("CREATE TABLE IF NOT EXISTS whitelist (usernames TEXT)", insertRows);
    //Added Servers, and changed Timed (Text) -> Expires (DateTime)
    db.serialize(() => {
        db.run('CREATE TABLE IF NOT EXISTS "whitelist" ("DiscordId" VARCHAR(22) NOT NULL,"McUsername" VARCHAR(16) NOT NULL UNIQUE,"Servers" TEXT DEFAULT NULL,"Waiting" TEXT DEFAULT NULL,"Issuer" VARCHAR(22) NOT NULL,"Active" BOOL NOT NULL DEFAULT 1,"Expires" DATETIME,"Added" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY("McUsername"));');
        db.run('CREATE TABLE IF NOT EXISTS "highest_role" ("DiscordId" VARCHAR(22) NOT NULL UNIQUE,"HighestRole" TEXT DEFAULT NULL,PRIMARY KEY("DiscordId"));');
    });
}

/**
 * Get the highest role recorded for a discord account
 * @param {number} discordId - The discord id of the user you want to query
 * @returns {string} - The highest role
 */
 function getHighestRole(discordId,callback) {
	db.get("SELECT DiscordId,HighestRole FROM highest_role WHERE DiscordId = ?", [discordId.toString()], (err, row) => {
        if (err) {logger.error(err.message);}
        callback(row);
	});
}

/**
 * Sets the highest role for a discord user
 * @param {number} discordId - The discord id of the user you are adding
 * @param {string} highestRole - The highestRole to set
 */
 function setHighestRole(discordId, newHighestRole) {
    getHighestRole(discordId,(row) => {
        if (typeof row == "undefined") {
            db.run("insert into highest_role(DiscordId,HighestRole) values (?,?)", [discordId.toString(), newHighestRole], (err) => {
                if (err) {logger.error(err.message);}
            });
        } else {
            if (newHighestRole != row.HighestRole) {
                db.run("UPDATE highest_role set HighestRole = ? WHERE DiscordId = ?;", [newHighestRole,discordId.toString()], (err) => {
                    if (err) { logger.error(err.message);}
                });
            }
        }
    });
}

/**
 * For all users in the highestRole
 */
 function forEachHighestRole(callback) {
    db.all("SELECT DiscordId,HighestRole FROM highest_role",[], (err, rows) => {
        if (err) { logger.error(err.message);}
        if (typeof rows != "undefined"){
            rows.forEach(obj => {
                callback(obj);
            });
        }
    });
}

/**
 * Removed a user from the database
 * @param {number} discordId - The discord id to be removed
 */
 function removeHighestRole(discordId) {
	db.run("DELETE FROM highest_role WHERE DiscordId=?", [discordId.toString()], (err) => {
		if (err) { logger.error(err.message);}
        logger.log('verbose',`HighestRole - Successfully deleted user: ${discordId.toString()}`);
	});
}

/**
 * Get the amount of accounts registered for that discord user (which are active)
 * @param {number} discordId - The discord id of the user you want to query
 * @returns {number} - Amount of accounts that are active
 */
 function countActiveAccounts(discordId,callback) {
	db.all("SELECT DiscordId,Active FROM whitelist WHERE DiscordId = ? AND Active == True", [discordId.toString()], (err, rows) => {
		if (err) {logger.error(err.message);}
        callback(typeof rows == "undefined" ? 0 : rows.length);
	});
}

/**
 * Get a list of accounts registered for that discord user (which are active)
 * @param {number} discordId - The discord id of the user you want to query
 * @returns {array[]} - Array of minecraft usernames (row)
 */
 function getActiveUsernames(discordId,callback) {
	db.all("SELECT DiscordId,McUsername,Active FROM whitelist WHERE DiscordId = ? AND Active == True", [discordId.toString()], (err, rows) => {
		if (err) {logger.error(err.message);}
        callback(typeof rows == "undefined" ? [] : rows.map(a => a.McUsername));
	});
}

/**
 * Get a list of accounts registered for that discord user (which are not active)
 * @param {number} discordId - The discord id of the user you want to query
 * @param {number} amt - Amount of accounts to get, if null it just gets them all
 * @returns {array[]} - Array of minecraft usernames (row)
 */
 function getInActiveUsernames(discordId, amt, callback) {
    if (amt == null) {
        db.all("SELECT DiscordId,McUsername,Active FROM whitelist WHERE DiscordId = ? AND Active == False;", [discordId.toString()], (err, rows) => {
            if (err) {logger.error(err.message);}
            callback(typeof rows == "undefined" ? [] : rows.map(a => a.McUsername));
        });
    } else {
        db.all("SELECT DiscordId,McUsername,Active FROM whitelist WHERE DiscordId = ? AND Active == False LIMIT ?;", [discordId.toString(),amt], (err, rows) => {
            if (err) {logger.error(err.message);}
            callback(typeof rows == "undefined" ? [] : rows.map(a => a.McUsername));
        });
    }
}

/**
 * Check if this user and minecraft account are linked
 * @param {number} discordId - The discord id of the user you want to check
 * @param {string} mcusername - The minecraft username that we want to check
 * @returns {boolean} - Array of minecraft usernames
 */
function isUsersAccount(discordId,mcusername,callback) {
	db.get("SELECT DiscordId,McUsername,Active FROM whitelist WHERE DiscordId = ? AND McUsername = ? LIMIT 1 COLLATE NOCASE;", [discordId.toString(),mcusername], (err, row) => {
		if (err) {logger.error(err.message);}
        callback(!(typeof rows == "undefined"));
	});
}

/**
 * Get the discordId associated to the minecrft username
 * @param {string} mcusername - The minecraft username of the person
 * @returns {string} - The discordId associated to the username
 */
function getDiscordId(mcusername,callback) {
	db.get("SELECT DiscordId,McUsername FROM whitelist WHERE McUsername = ?;", [mcusername], (err, row) => {
		if (err) {logger.error(err.message);}
        callback(typeof row == "undefined" ? null : row.DiscordId);
	});
}

/**
 * Get a username connected to a discordId with all the data
 * @param {string} mcusername - The minecraft username you want to query
 * @returns {row} - Array of data
 */
function getUsername(mcusername,callback) {
	db.get("SELECT DiscordId,McUsername,Servers,Waiting,Issuer,Active,Expires,Added FROM whitelist WHERE McUsername = ? LIMIT 1;", [mcusername], (err, row) => {
		if (err) {logger.error(err.message);}
		callback(row);
	});
}

/**
 * Get a list of usernames connected to a discordId
 * @param {number} discordId - The discord id of the user you want to query
 * @returns {string[]} - Array of minecraft usernames
 */
function getUsernames(discordId,callback) {
	db.all("SELECT DiscordId,McUsername FROM whitelist WHERE DiscordId = ?;", [discordId.toString()], (err, rows) => {
		if (err) {logger.error(err.message);}
		callback(rows.map(a => a.McUsername));
	});
}

/**
 * Adds a user to the database
 * @param {number} discordId - The discord id of the user you are adding
 * @param {string} username - The minecraft username of the user
 * @param {number} issuerId - The discord id of the user that added the player
 */
function setUsername(discordId, username, issuerId) {
	db.run("insert into whitelist(DiscordId,McUsername,Active,Issuer) values (?,?,1,?)", [discordId.toString(), username,issuerId.toString()], (err) => {
		if (err) {logger.error(err.message);}
        logger.log('verbose',`Database: ${username} was whitelisted!`);
	});
}

/**
 * Checks if the minecraft username is available
 * @param {number} discordId - The discord id of the user you want to query
 * @param {string} username - The username of the user you want to query
 * @returns {row | null} - Returns null if its available, or the row otherwise
 */
function isMcUsernameAvailable(username, callback) {
	db.get("SELECT DiscordId,McUsername,Servers,Active FROM whitelist WHERE McUsername = ? COLLATE NOCASE;", [username], (err, row) => {
		if (err) {logger.error(err.message);}
        callback(typeof row == "undefined" ? null : row);
	});
}

/**
 * Change the active state of a single minecraft username (if active false, they are unwhitelisted)
 * @param {boolean} active - If should be set to active or not
 * @param {string} username - The minecraft username of the user
 */
function setActive(active,username) {
    db.run("UPDATE whitelist set Active = ? WHERE McUsername = ?;", [active,username], (err) => {
        if (err) { logger.error(err.message);}
        logger.log('verbose',`The account: ${username} has been ${active ? 'activated' : 'deactivated'}`);
    });
}

/**
 * Change the active state of a single minecraft username (if active false, they are unwhitelisted)
 * @param {boolean} active - If should be set to active or not
 * @param {string} username - The minecraft username of the user
 */
 function setActiveCallback(active,username,callback) {
    db.run("UPDATE whitelist set Active = ? WHERE McUsername = ?;", [active,username], (err) => {
        if (err) { logger.error(err.message);}
        logger.log('verbose',`The account: ${username} has been ${active ? 'activated' : 'deactivated'}`);
        callback();
    });
}

/**
 * Get the active state of a single minecraft username
 * @param {string} username - The minecraft username of the user
 * @returns {boolean} - Returns true if the username is active
 */
function getActive(username, callback) {
    db.run("SELECT McUsername,Active FROM whitelist WHERE McUsername = ? LIMIT 1;", [username], (err, row) => {
        if (err) { logger.error(err.message);}
        callback(typeof row != "undefined" ? row.Active : false);
    });
}

/**
 * Adds the waiting info to the minecraft username
 * @param {number} action - The action to schedule till the server is back up
 * @param {string} username - The minecraft username of the user
 * @param {string} server - The server ip which needs to run the operation
 * @param {boolean} quietly - If it should be done quietly
 */
function addWaiting(action,username,server,quietly,callback) {
	db.get("SELECT McUsername,Waiting,Active FROM whitelist WHERE McUsername = ? AND Active == True COLLATE NOCASE;", [username], (err, row) => {
		if (err) { logger.error(err.message);}
		let waiting;
		if (typeof row != "undefined") {
            if (row.Waiting != null) {
                const waitingArray = JSON.parse(row.Waiting);
                if (waitingArray.some(obj => (obj[1] == server && obj[0] == action))) { //Prevent duplicates
                    waiting = null; //Maybe handle quietly overrides later
                } else {
                    if (waitingArray.some(obj => obj[1] == server && ((action == Actions.Unwhitelist.id && obj[0] == Actions.Whitelist.id) || (action == Actions.Whitelist.id && obj[0] == Actions.Unwhitelist.id)))) { //Opposites cancel out
				        waiting = JSON.stringify(waitingArray.filter(obj => obj[1] != server)); //remove the opposite action from the list
                    } else {
                        waitingArray.push([action,server,quietly]);
				        waiting = JSON.stringify(waitingArray);
                    }
                }
			} else {
				waiting = JSON.stringify([[action,server,quietly]]);
			}
            if (waiting != null) {
                db.run("UPDATE whitelist set Waiting = ? WHERE McUsername = ?;", [waiting,username], (err) => {
                    if (err) { logger.error(err.message);}
                    callback();
                });
            } else {
                callback();
            }
		} else {
			logger.log('verbose',"That user does not exist!!!");
        }
	});
}

/**
 * Remove a single server from the waiting list
 * @param {string} username - The minecraft username of the user
 * @param {string} server - The server ip which needs to run the operation
 */
 function removeWaiting(username,server, callback) {
	db.get("SELECT McUsername,Waiting FROM whitelist WHERE McUsername = ? LIMIT 1 COLLATE NOCASE;", [username], (err, row) => {
		if (err) { logger.error(err.message);}
		if (typeof row != "undefined") {
            const currentWaiting = JSON.parse(row.Waiting);
		    const waiting = JSON.stringify(typeof currentWaiting == "object" ? currentWaiting.filter(obj => obj[1] != server) : []);
            db.run("UPDATE whitelist set Waiting = ? WHERE McUsername = ?", [waiting,username], (err) => {
			    if (err) { logger.error(err.message);}
                logger.log('verbose',`Removed Waiting for username: ${username}, on server: ${server}`);
                callback();
		    });
		} else {
			logger.log('verbose',"That user does not exist!!!");
		}
	});
}

/**
 * Gets the waiting info for the minecraft username
 * @param {string} username - The minecraft username of the user
 * @returns {Array[]} - Returns an array of arrays, the inner array contains [number,string,string]
 */
function getWaiting(username, callback) {
	db.get("SELECT McUsername,Waiting,Active FROM whitelist WHERE McUsername = ? AND Active == True COLLATE NOCASE;", [username], (err, row) => {
		if (err) { logger.error(err.message);}
		callback(typeof row != "undefined" ? JSON.parse(row.Waiting) : []);
	});
}

/**
 * For all players that are Waiting try to add them
 */
function forEachWaiting(callback) {
    db.each("SELECT DiscordId,McUsername,Waiting,Active FROM whitelist WHERE Active == True AND Waiting IS NOT NULL;",[], (err, row) => {
        if (err) { logger.error(err.message);}
        if (typeof row != "undefined"){
            JSON.parse(row.Waiting).forEach((obj,_) => {
                removeWaiting(row.McUsername,obj[1], () => {
                    callback(row.McUsername,obj);
                });
            });
        }
    });
}

/**
 * Adds the server info to the minecraft username
 * @param {string} username - The minecraft username of the user
 * @param {string} server - The server to add
 */
 function addServer(username,server, callback) {
	db.get("SELECT McUsername,Servers,Active FROM whitelist WHERE McUsername = ? AND Active == True COLLATE NOCASE;", [username], (err, row) => {
		if (err) { logger.error(err.message);}
		let servers;
		if (typeof row != "undefined") {
            if (row.Servers != null) {
                const serverArray = JSON.parse(row.Servers);
                if (!serverArray.includes(server)) { //prevent duplicates
                    serverArray.push(server)
				    servers = JSON.stringify(serverArray);
                }
			} else {
				servers = JSON.stringify([server]);
			}
            if (servers != null) {
                db.run("UPDATE whitelist set Servers = ? WHERE McUsername = ?;", [servers,username], (err) => {
                    if (err) { logger.error(err.message);}
                    callback();
                });
            } else {
                callback();
            }
		} else {
			logger.log('verbose',"That user does not exist!!!");
        }
	});
}

/**
 * Remove a single server from the server list
 * @param {string} username - The minecraft username of the user
 * @param {string} server - The server name to remove from the list
 */
 function removeServer(username, server, callback) {
	db.get("SELECT McUsername,Servers FROM whitelist WHERE McUsername = ? LIMIT 1 COLLATE NOCASE;", [username], (err, row) => {
		if (err) { logger.error(err.message);}
		if (typeof row != "undefined") {
            const currentServers = JSON.parse(row.Servers);
		    const servers = JSON.stringify(currentServers.filter(val => val != server));
            db.run("UPDATE whitelist set Servers = ? WHERE McUsername = ?", [servers,username], (err) => {
			    if (err) { logger.error(err.message);}
                logger.log('verbose',`Removed Server for username: ${username}`);
                callback();
		    });
		} else {
			logger.log('verbose',"That user does not exist!!!");
		}
	});
}

/**
 * Gets the server info for the minecraft username
 * @param {string} username - The minecraft username of the user
 * @returns {string[]} - Returns an array of servers (string)
 */
function getServers(username,callback) {
	db.get("SELECT McUsername,Servers,Active FROM whitelist WHERE McUsername = ? AND Active == True COLLATE NOCASE;", [username], (err, row) => {
		if (err) { logger.error(err.message);}
		callback(typeof row != "undefined" ? JSON.parse(row.Servers) : []);
	});
}

/**
 * Removed a user from the database - DO NOT USE THIS UNLESS ABSOLUTLY REQUIRED!
 * @param {string} username - The minecraft username of the user
 */
 function removeUser(username) {
	db.run("DELETE FROM whitelist WHERE McUsername=?", [username], (err) => {
		if (err) { logger.error(err.message);}
        logger.log('verbose',"Successfully deleted user!");
	});
}

/**
 * gets all accounts which are over the limit and need to be un-whitelisted & set to active false
 * @param {number} discordId - The discord id of the account to check
 * @returns {string[]} - Returns an array of minecraft usernames to remove (string)
 */
function getAccountsOverLimit(discordId,removeAmt,callback) {
    db.all("SELECT DiscordId,McUsername,Active,Added FROM whitelist WHERE DiscordId = ? AND Active == True ORDER BY Added DESC LIMIT ?",[discordId.toString(),removeAmt], (err, rows) => {
        if (err) { logger.error(err.message);}
        callback(typeof row == "undefined" ? [] : rows.map(a => a.McUsername));
    });
}

module.exports = {
    init,
    getHighestRole,
    setHighestRole,
    forEachHighestRole,
    removeHighestRole,
    countActiveAccounts,
    getActiveUsernames,
    getInActiveUsernames,
    isUsersAccount,
    getDiscordId,
    getUsername,
    getUsernames,
    setUsername,
    isMcUsernameAvailable,
    getWaiting,
    setActive,
    setActiveCallback,
    getActive,
    addWaiting,
    removeWaiting,
    getWaiting,
    addServer,
    removeServer,
    getServers,
    removeUser,
    forEachWaiting,
    getAccountsOverLimit
};