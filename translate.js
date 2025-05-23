import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import pkg from '@slack/bolt';
const { App, ExpressReceiver } = pkg;
import fs from 'fs';
import axios from 'axios';
import OpenAI from 'openai';

// Initialize OpenAI with the API key
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Create an instance of ExpressReceiver
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: '/slack/events' // The endpoint for Slack events
});

// Initialize Slack app with your bot token and receiver
const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: receiver
});

// Handle incoming messages that mention the bot
slackApp.message(async ({ message, say }) => {
  if (message.files && message.files.length > 0) {
    const fileUrl = message.files[0].url_private;
    const fileName = message.files[0].name;

    // Download the audio file from Slack
    const response = await axios.get(fileUrl, {
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      responseType: 'stream',
    });

    const filePath = `/tmp/${fileName}`;
    const writer = fs.createWriteStream(filePath);

    response.data.pipe(writer);

    writer.on('finish', async () => {
      try {
        // Transcribe the audio using OpenAI Whisper
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model: 'whisper-1',
        });

        // Translate the transcribed text using the local translation service
        const translateResponse = await axios.post('http://localhost:3000/translate', {
          text: transcription.text
        });

        // Send the translated text back to the Slack channel
        await say(`Translated Text: ${translateResponse.data.translatedText}`);
      } catch (error) {
        console.error('Error during transcription or translation:', error);
        await say('There was an error processing your request.');
      }
    });

    writer.on('error', (err) => {
      console.error('Error writing file:', err);
      say('There was an error downloading the file.');
    });
  } else {
    await say('Please upload an audio file for transcription.');
  }
});

// Create an Express app
const app = express();

// Integrate the receiver's router with your existing Express app
app.use(receiver.router);

// Start the Express server
app.listen(process.env.PORT || 3000, () => {
  console.log('Slack bot is running!');
});
