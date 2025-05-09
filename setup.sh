#! /usr/bin/env bash


VOSK_URL="https://alphacephei.com/vosk/models"
VOSK_MODEL="vosk-model-fr-0.22"

rm -r vosk-model 2>&1 >/dev/null

wget $VOSK_URL/$VOSK_MODEL".zip"
unzip $VOSK_MODEL".zip" 
mv $VOSK_MODEL vosk-model
rm $VOSK_MODEL".zip"
