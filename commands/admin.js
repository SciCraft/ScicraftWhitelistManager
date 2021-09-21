const argumentAmt = {min:1,max:2};

function run(discordClient, isAdmin, highestRole, user, channel, args) { //Function to run
    if (args[0] == "reload") {
        discordClient.experimentalReload();
    } else if (args[0] == "shutdown") {
        discordClient.end();
    }
}

module.exports = { run, argumentAmt };