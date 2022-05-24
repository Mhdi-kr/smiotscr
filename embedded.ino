#include <Arduino.h>
#include "SPI.h"
#include <ESP8266WiFi.h>
#include <ESP8266WiFiMulti.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Adafruit_ILI9341.h>
#include <TJpg_Decoder.h>

// Constants
#define IMAGE_SIZE 6000
#define TFT_BLACK 0x0000
#define TFT_RED 0xF800

// Pins
#define SHOCK_IN A0
#define LED_OUT D1
#define TFT_CS 15
#define TFT_RST 0
#define TFT_DC 2

// Global Allocations
uint8_t myBitmap[IMAGE_SIZE];
String temp = "";
int myIndex = 0;
const char *AP_SSID = "Mahdi";
const char *AP_PASSWORD = "headquarters@2021";
const char *HTTPS_ENDPOINT = "https://www.dumas.ir:3030/jpg2hex";

// Object declarations
Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);
ESP8266WiFiMulti WiFiMulti;
WiFiClientSecure client;
HTTPClient http;

bool tft_output(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t* bitmap)
{
  Serial.println(w);
  Serial.println(h);
  // Stop further decoding as image is running off bottom of screen
  if ( y >= tft.height() ) return 0;

  // In ILI9341 library this function clips the image block at TFT boundaries
  tft.drawRGBBitmap(x, y, bitmap, w, h);

  // Return 1 to decode next block
  return 1;
}

void setup() {
  // Serial configuration
  Serial.begin(115200);
  client.setInsecure(); //the magic line, use with caution
  client.connect(HTTPS_ENDPOINT, 443);
  // Jpg decoder configuration
  TJpgDec.setJpgScale(1);
  TJpgDec.setCallback(tft_output);

  // TFT configuration
  tft.begin();
  tft.fillScreen(TFT_BLACK);

  // LED digital pin configuration
  pinMode(SHOCK_IN, INPUT);
  pinMode(LED_OUT, OUTPUT);

  // access point connection
  for (uint8_t t = 4; t > 0; t--) {
    Serial.printf("[SETUP] WAIT %d...\n", t);
    Serial.flush();
    digitalWrite(LED_OUT, LOW);
    delay(500);
    digitalWrite(LED_OUT, HIGH);
    delay(500);
  }

  // WiFi configuration
  WiFi.mode(WIFI_STA);
  WiFiMulti.addAP(AP_SSID, AP_PASSWORD);
}

void loop() {
  if ((WiFiMulti.run() == WL_CONNECTED)) {
    tft.fillScreen(TFT_BLACK);
    digitalWrite(LED_OUT, LOW);
    Serial.print("[HTTP] begin...\n");
    if (http.begin(client, HTTPS_ENDPOINT)) {
      Serial.print("[HTTP] GET...\n");
      // start connection and send HTTP header
      int httpCode = http.GET();
      // httpCode will be negative on error
      if (httpCode > 0) {
        // HTTP header has been send and Server response header has been handled
        Serial.printf("[HTTP] GET... code: %d\n", httpCode);
        // file found at server
        if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_MOVED_PERMANENTLY) {
          String payload = http.getString();
          for (int i = 0; i < IMAGE_SIZE; i++) {
            myBitmap[i] = 0;
          }
          myIndex = 0;
          for (int i = 0; i < payload.length(); i++) {
            if (payload[i] != ',') {
              temp += payload[i];
            } else {
              myBitmap[myIndex] = (uint8_t) atoi(temp.c_str());
              myIndex += 1;
              temp = "";
            }
          }
          TJpgDec.drawJpg(0, 0, myBitmap, sizeof(myBitmap));
          Serial.print(sizeof(myBitmap));
          digitalWrite(LED_OUT, HIGH);
          delay(5000);
          digitalWrite(LED_OUT, LOW);
          tft.fillScreen(TFT_BLACK);
        }
      }
      //      else {
      //        tft.drawBitmap(0, 16, snapMarketDefault, 128, 128, 0xFFFF);
      //        digitalWrite(D1, HIGH);
      //        tft.enableDisplay(true);
      //        // wait for 10 secs
      //        delay(10000);
      //        digitalWrite(D1, LOW);
      //        digitalWrite(16, HIGH);
      //        tft.enableDisplay(false);
      //        Serial.printf("[HTTP] GET... failed, error: %s\n", http.errorToString(httpCode).c_str());
      //      }
      http.end();
    }
  } else {
    // wait for 5 seconds
    delay(5000);
  }
}
