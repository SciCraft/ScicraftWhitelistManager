const Utils = require("../Utils");
const Discord = require("discord.js");

const argumentAmt = {min:1,max:1};

function run(discordClient, isAdmin, highestRole, user, channel, args) { //Function to run
    Utils.getUserOrUsername(args[0],channel,isAdmin ? (userid) => { //IsAdmin
        sendEmbedDiscord(discordClient,userid,channel);
    } : (userid) => { //isNotAdmin
        if (userid == user.id) {
            sendEmbedDiscord(discordClient,userid,channel);
        } else {channel.send("You are only able to check your own profile");}
    },isAdmin ? (username) => { //IsAdmin
        discordClient.Database.getUsername(username,(row) => {
            if (row != undefined) {
                sendEmbedUsername(discordClient,channel,row);
            } else {channel.send("Unable to find user data in the database");}
        });
    } : (username) => { //isNotAdmin
        discordClient.Database.isUsersAccount(user.id,username,(isValid) => {
            if (isValid) {
                discordClient.Database.getUsername(username,(row) => {
                    if (row != undefined) {
                        sendEmbedUsername(discordClient,channel,row);
                    } else {channel.send("Unable to find user data in the database");}
                });
            } else {channel.send("You are only able to check your own profile");}
        });
    });
}

function sendEmbedDiscord(discordClient,mention,channel) {
    discordClient.users.fetch(mention).then(user => {
        discordClient.Database.getUsernames(user.id,(usernames) => {
            channel.send(new Discord.MessageEmbed()
                .setTitle(user.tag)
                .setFooter("userId: "+mention)
                .setURL("https://discordapp.com/users/"+user.id+"/")
                .setThumbnail(user.displayAvatarURL())
                .setDescription("**Usernames:**\n `"+usernames.join("`,`")+"`"));
        });
    });
}

//For time to be displayed correctly. You are going to want to make your host timezone GMT
function sendEmbedUsername(discordClient,channel,row) {
    discordClient.users.fetch(row.DiscordId).then(user => {
        Utils.usernameToUUID(row.McUsername, (uuid) => {
            const waiting = JSON.parse(row.Waiting);
            const servers = JSON.parse(row.Servers);
            channel.send(new Discord.MessageEmbed()
                .setColor((row.Active ? "#00EE00" : "EE0000"))
                .setAuthor(row.McUsername,user.displayAvatarURL(),"https://discordapp.com/users/"+row.DiscordId+"/")
                .setFooter("Added on:")
                .setTimestamp(row.Added)
                .setThumbnail("https://crafatar.com/avatars/"+uuid+"?overlay=true")
                .setDescription((servers != null ? "**Servers:** `"+servers.join("`,`") : "")+"`\n"+(waiting != null ? "**Waiting:** `"+waiting.join("`,`")+"`" : ""))
                .addFields(
                    { name: 'Belongs to: ', value: '<@'+(row.DiscordId || "0")+'>', inline: true },
                    { name: 'Issued by: ', value: '<@'+(row.Issuer || "0")+'>', inline: true },
                    { name: 'Is Active: ', value: (row.Active ? "`True`" : "`False`"), inline: true },
                    { name: 'Expires: ', value: (row.Expires ? "<t:"+Math.floor(new Date(row.Expires).getTime()/1000.0)+">" : "`Never`"), inline: true }
            ));
        });
    });
}

module.exports = { run, argumentAmt };