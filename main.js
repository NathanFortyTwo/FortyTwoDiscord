const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, EndBehaviorType } = require('@discordjs/voice');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const prism = require('prism-media');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const wav = require('wav');
const vosk = require('vosk');
require('dotenv').config();

const MODEL_PATH = './vosk-model';
const SAMPLE_RATE = 64000;
const token = process.env.TOKEN;
const guildId = process.env.guildId;
const channelId = process.env.channelId;
const decoderSettings = { frameSize: 960, channels: 2, rate: 48000 };

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

let model;
const activeRecognizers = new Map();

client.once('ready', () => {
  console.log(`Connected as ${client.user.tag}`);

  try {
    console.log('Loading Vosk...');
    model = new vosk.Model(MODEL_PATH);
    console.log('Loaded');
  } catch (error) {
    return;
  }

  const conn = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator: client.guilds.cache.get(guildId).voiceAdapterCreator,
    selfDeaf: false,
  });

  const player = createAudioPlayer();
  conn.subscribe(player);

  conn.receiver.speaking.on('start', (uid) => {
    if (activeRecognizers.has(uid)) return;
    activeRecognizers.set(uid, true);

    const opusStream = conn.receiver.subscribe(uid, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1000,
      },
    });

    const decoder = new prism.opus.Decoder(decoderSettings);
    const pcmPath = `./tmp/${uid}.pcm`;
    const wavPath = `./tmp/${uid}.wav`;

    const out = fs.createWriteStream(pcmPath);
    const handleError = (err) => {
      console.error(`Stream error for ${uid}:`, err);
      cleanup(uid, [pcmPath, wavPath]);
    };

    opusStream.on('error', handleError);
    decoder.on('error', handleError);
    out.on('error', handleError);

    opusStream.pipe(decoder).pipe(out);

    opusStream.on('end', () => {
      out.end();

      out.on('finish', async () => {
        try {
          if (!fs.existsSync(pcmPath)) {
            console.warn(`Missing pcm file ${uid}`);
            activeRecognizers.delete(uid);
            return;
          }
          
          convertPCMtoWAV(pcmPath, wavPath);
          if (fs.existsSync(wavPath)) {
            await detectKeyWord(uid, wavPath, conn, player);
          }

          cleanup(uid, [pcmPath, wavPath]);
        } catch (err) {
        }
      });
    });
  });
});

client.login(token);

function convertPCMtoWAV(pcmFile, wavFile) {
  spawnSync('ffmpeg', [
    '-f', 's16le',
    '-ar', SAMPLE_RATE.toString(),
    '-ac', '1',
    '-i', pcmFile,
    '-filter:a', 'asetrate=96000,aresample=48000',
    wavFile,
  ], { stdio: 'ignore' });
}

async function detectKeyWord(uid, wavFile, conn, player) {
  const wfReader = new wav.Reader();
  const stream = fs.createReadStream(wavFile);
  const timeout = setTimeout(() => {
    wfReader.destroy();
  }, 10000); // Timeout 10s max

  wfReader.on('format', (format) => {
    const rec = new vosk.Recognizer({ model, sampleRate: format.sampleRate });
    wfReader.on('data', (data) => rec.acceptWaveform(data));
    wfReader.on('end', () => {
      clearTimeout(timeout);
      const result = rec.finalResult();
      const text = result.text.toLowerCase();
      console.log(`Transcription (${uid}): ${text}`);
      if (text.includes(process.env.TARGET_KEYWORD)) {
        const resource = createAudioResource('audio/audio.m4a');
        player.play(resource);
      }
      rec.free();
    });
  });

  wfReader.on('error', (err) => {
    stream.destroy();
    clearTimeout(timeout);
  });

  stream.pipe(wfReader);
}

function cleanup(uid, files) {
  files.forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
    }
  });

  activeRecognizers.delete(uid);
}
