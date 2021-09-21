const Utils = require("../Utils");
const Config = require("../Config");

const argumentAmt = {min:1,max:-1};

function run(discordClient, isAdmin, highestRole, user, channel, args) { //Be careful about turning adminOnly off for this one xDDD
    Utils.parseServerName(Config,highestRole,args.shift(),true,(serverName) => {
        Config.customScheduleAction(Config.Actions.Custom.id, serverName,args.join(' ')); //Send commands to servers
    });
}

module.exports = { run, argumentAmt };