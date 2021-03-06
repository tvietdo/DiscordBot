// Discord Bot
// Github located at http://www.github.com/tvietdo/DiscordBot
// Forked from PoEWikiBot

//Dependencies
const Discord = require("discord.js");
const puppeteer = require('puppeteer');

//Parser for the RSS feed
let Parser = require('rss-parser');
let parser = new Parser();


const wikiRegex = new RegExp("\\[\\[([^\\[\\]]*)\\]\\]", "gu");
const urlRegex = new RegExp("\\w", "g");

const SimpleNodeLogger = require('simple-node-logger')


//Error Logging
errorLog = SimpleNodeLogger.createSimpleLogger({
    logFilePath: './logs/error.log',
    timestampFormat: 'YYYY-MM-DD HH:mm:ss'
});

log = SimpleNodeLogger.createSimpleLogger({
    logFilePath: './logs/requests.log',
    timestampFormat: 'YYYY-MM-DD HH:mm:ss'
});

errorLog.setLevel('error');

var config = require("./config.json");

var client = new Discord.Client({
    disableEveryone: true,
    disabledEvents: ["TYPING_START"]
});

var browswer;

client.token = config.token;

client.login();
console.log("Logged in");

//My Code
//Waiting for the RSS feed
//The purpose of this block of code was to pull RSS news about newly released shows
//The framework of this was to also pull from twitter
(async () => {
    let feed = await parser.parseURL('https://www.pathofexile.com/news/rss');
    console.log(feed.title);

    feed.items.slice(3).forEach(item => {
        console.log(item.title + ':' + item.link)
        client.on("message", message => {
            if (message.content == 'anime subs'){
                message.channel.send(item.title + ':' + item.link)
            }
        })

    });
})();

//Meme review message checking
//Rudimentary call/answer function for practice
client.on("message", message => {
	if (message.content === 'clap clap'){
		message.channel.send('MEME REVIEW');
	}
});

// Create an event listener for new guild members
client.on('guildMemberAdd', member => {
  // Send the message to a designated channel on a server:
  const channel = member.guild.channels.find('name', 'lobby');
  // Do nothing if the channel wasn't found on this server
  if (!channel) return;
  // Send the message, mentioning the member
  channel.send(`Welcome to the server, ${member}`);
});

//Daleroy1 code
//Setup our browswer
(async () => {
    browser = await puppeteer.launch({
        ignoreHTTPSError: true,
        headless: true,
        handleSIGHUP: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
})();

client.on("ready", () => {
	client.user.setActivity({game: {name: "Certified Idiot", type: 0}});
    console.log(`Ready as ${client.user.username}`);
});

//Wiki message checking
client.on("message", (message) => {
    if (message.author.id == client.user.id) {
        //Disabled this check, as it causes it to not do a check if you post twice in a row.
        //return;
    }
    try {
        const server = message.guild.name;

        let matches = wikiRegex.exec(message.cleanContent);
        if (matches != null && matches.length > 0) {
            for (let i = 1; i < matches.length; i++) {
                handleItem(titleCase(matches[i]), message.channel, server);
            }
        }
    } catch (error) {
        errorLog.error(`"${error.message}"`);
    }
});


async function handleItem(name, channel, server) {
    let itemUrlPart = convertToUrlString(name);
    var url = config.wikiURL + itemUrlPart;
    let initalMessage = "Retrieving details from the Wiki for **" + name + "**";
    var messageId;
    await channel
        .send(initalMessage)
        .then(message => {
            //console.log(`Sent message: ${message.id} ${initialMessage}`);
            messageId = message.id;
        })
        .catch(error => {
            //console.log(error.message)
            errorLog.error(`"${error.message}" "${server}" "${name}"`);
        })

    if (messageId != null) {
        await getImage(url, server)
            .then((result) => {
                if (result.success == false) {
                    channel
                        .fetchMessage(messageId)
                        .then(message => {
                            message.edit("Some guy tried to be clever with: **" + name + "**");
                        })
                        .catch(error => {
                            errorLog.error(`"${error.message}" "${server}" "${name}"`);
                        })
                } else {
                    log.info(`"${server}" "${name}" "${url}"`);
                    //need a way that lets us add an attachment message, currently I can only edit text to it
                    let output = '<' + url + '>';
                    //if no screenshot, just edit the original message
                    if (result.screenshot == false) {
                        channel
                            .fetchMessage(messageId)
                            .then(message => {
                                message.edit(output);
                            })
                            .catch(error => {
                                errorLog.error(`"Could not edit message ${messageId}" "${server}" "${name}"`);
                            })
                    } else {
                        //otherwise delete the message and create a new one with the screenshot
                        channel
                            .fetchMessage(messageId)
                            .then(message => {
                                message.delete();
                            })
                            .catch(error => {
                                errorLog.error(`"Could not delete message ${messageId}" "${server}" "${name}"`);
                            })
                        channel.send(output, { file: result.screenshot });
                    }
                    console.log('Found in the wiki and sent: ' + url);
                }
            })
            .catch(error => {
                errorLog.error(`"${error.message}" "${server}" "${name}"`);
            })
    }
}

async function getImage(url, server) {
    //console.time('getPage')
    const page = await browser.newPage();
    //Disabling Javascript adds 100% increased performance
    await page.setJavaScriptEnabled(config.enableJavascript)
    var output = {
        screenshot: false,
        success: false
    }

    //Set a tall page so the image isn't covered by popups
    await page.setViewport({ 'width': config.width, 'height': config.height });

    try {
        //played around with a few different waitUntils.  This one seemed the quickest.
        //If you don't disable Javascript on the PoE Wiki site, removing this parameter makes it hang
        await page.goto(url, { waitUntil: 'load' });
    } catch (error) {
        errorLog.error(`"${error.message}" "${server}" "${url}"`);
    }

    var invalidPage = await page.$(config.wikiInvalidPage);
    //if we have a invalid page, lets exit
    if (invalidPage != null) {
        return output;
    }

    var infoBox = await page.$('.infocard');
    if (infoBox != null) {
        try {
            output.screenshot = await infoBox.screenshot();
            output.success = true;
        } catch (error) {
            output.success = true;
        }
        return output;
    }

    //if we have a div for the item, screenshot it.
    //If not, just return the page without the screenshot
    const div = await page.$(config.wikiDiv);
    if (div != null) {
        try {
            output.screenshot = await div.screenshot();
            output.success = true;
        } catch (error) {
            output.success = true;
        }
    } else {
        output.success = true;
    }

    await page.close();
    //console.timeEnd('getPage')
    return output;

}

function convertToUrlString(name) {
    return name.replace(new RegExp(" ", "g"), "_");
}

function titleCase(str) {
    let excludedWords = ["of", "and", "the", "to", "at", "for"];
    let words = str.split(" ");
    for (var i in words) {
        if ((i == 0) || !(excludedWords.includes(words[i].toLowerCase()))) {
            words[i] = words[i][0].toUpperCase() + words[i].slice(1, words[i].length);
        } else {
            continue;
        }
    }
    return words.join(" ");
};
