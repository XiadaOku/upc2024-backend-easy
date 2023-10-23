import 'dotenv/config'
import { Markup, Telegraf } from 'telegraf';
import ytdl from 'ytdl-core';
import fs from 'fs';
import cheerio from 'cheerio';
import youtubedl from 'youtube-dl-exec';


async function getLink(url) {
  var response, body, $, contentDiv, result, mpd, mpd_url, title = "";

  while (title.length == 0) {
    response = await fetch(url, { method:'POST' });
    body = await response.text();
    $ = cheerio.load(body);

    contentDiv = $('.content');
    result = contentDiv.next().html();

    mpd = result.indexOf('mpd');
    var pos = mpd;
    if (pos===-1){
      return {
        title: "",
        url: ""
      }
    }
    while (result[pos]+result[pos-1]+result[pos-2]+result[pos-3]!=="ptth"){
      pos--;
    }
    
    title = $('[aria-label="Название видео"]').first().text();
    mpd_url = result.slice(pos-3,mpd+3);
  }
  
  return {
    title: title,
    url: mpd_url
  };
}

async function download(url, title, filename, message, ctx) {
  const process = youtubedl.exec(url, {
    output: filename,
    format: "worstvideo[ext=mp4]+bestaudio[ext=m4a]/worst/best",
    subFormat: "ext:mp4:m4a"
  });

  var progress = 0;
  var progress_base = 0;

  process.stdout.on('data', (data) => {
    try {
      const buffer = Buffer.from(data, "utf-8");

      const output = buffer
        .toString()
        .trim()
        .split(" ")
        .filter(n => n);

      if (output[0] === "[download]" && parseFloat(output[1])) {
        progress = parseFloat(output[1]);
        if (progress == 100) {
          progress_base = 100;
        }
      }
    }
    catch {}
  })

  const interval = setInterval(async () => {
    await bot.telegram.editMessageText(
      ctx.chat.id, 
      message.message_id, 
      undefined, 
      `Downloading video: ${title} (${(progress + progress_base) / 2}%)`
    ).catch(err => null);
  }, 1000);

  process.then(async () => {
    clearInterval(interval);

    await bot.telegram.editMessageText(
      ctx.chat.id, 
      message.message_id, 
      undefined, 
      "Video downloaded"
    ).catch(err => null);

    await ctx.replyWithVideo({
      source: filename
    }, {
      caption: title
    }).catch(err => null);

    fs.unlinkSync(filename);
  });
}


const bot = new Telegraf(process.env.BOT_TOKEN);

const youtubeRegex = /(youtu.*be.*)\/(watch\?v=|embed\/|v|shorts|)(.*?((?=[&#?])|$))/gm;
const vkRegex = /vk\.com\/video.*\?z=(video-?\d+_\d+)/gm;
const dzenRegex = /dzen\.ru\/video\/watch\/(.*?(?=[&#?])|$)/gm;


bot.start(async (ctx) => {
  await ctx.reply("Добро пожаловать. Отправьте ссылку на видео (YouTube/VK/Dzen)").catch(err => null);
});


bot.hears(youtubeRegex, async (ctx) => {
  const id = ctx.match[3];
  if (ytdl.validateID(id)) {
    const url = `https://www.youtube.com/watch?v=${id}`;
    const info = await ytdl.getInfo(id);
    const title = info.videoDetails.title;

    const message = await ctx.reply(`Downloading video: ${title}`).catch(err => null);

    const filename = `${Date.now()}.mp4`;
    
    await download(url, title, filename, message, ctx);
  }
  else {
    await ctx.reply("not valid yt link").catch(err => null);
  }
});

bot.hears(dzenRegex, async (ctx) => {
  const {title, url} = await getLink(ctx.message.text);

  const message = await ctx.reply(`Downloading video: ${title}`).catch(err => null);

  const filename = `${Date.now()}.mp4`;

  await download(url, title, filename, message, ctx);
});

bot.hears(vkRegex, async (ctx) => {
  const id = ctx.match[1];

  const url = `https://vk.com/video?z=${id}`;

  const title = "";
  const message = await ctx.reply(`Downloading video: ${title}`).catch(err => null);
  const filename = `${Date.now()}.mp4`;
  
  await download(url, title, filename, message, ctx);
})


bot.on('text', async (ctx) => {
    await ctx.reply("Отправьте ссылку на видео (YouTube/VK/Dzen)").catch(err => null);
});

bot.launch();


console.log("Bot started");

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));