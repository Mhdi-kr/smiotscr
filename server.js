const express = require("express");
const QR = require("qrcode");
const Jimp = require("jimp");
const fs = require("fs");
const bmp = require("bmp-js");
const fileUpload = require("express-fileupload");

const app = express();

app.use("/devices/:id", (req, res, next) => {
  const { id } = req.params;
  const isValidMacAddr = String(id).match(
    /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
  );
  isValidMacAddr ? next() : res.sendStatus(400);
});

app.use(
  fileUpload({
    createParentPath: true,
  })
);
app.use(express.json());

const imageWriter = (macaddr) => fs.createWriteStream(`${String(macaddr)}.jpg`);

app.get("/devices/:id", (req, res) => {
  let metadata = { interval_millis: 2000, sensitivity: 0.5, mtime: "" };
  try {
    metadata = JSON.parse(
      fs.readFileSync(
        `${__dirname}/public/devices/${req.params.id}.json`,
        "utf-8"
      )
    );
  } catch (err) {
    fs.writeFileSync(
      `${__dirname}/public/devices/${req.params.id}.json`,
      JSON.stringify({
        interval_millis: 2000,
        sensitivity: 0.5,
        mtime: "",
      }),
      "utf-8"
    );
  }
  res
    .setHeader("x-qbar-interval", metadata.interval_millis)
    .setHeader("x-qbar-sensitivity", metadata.sensitivity)
    .setHeader("x-qbar-mtime", metadata.mtime);
  if (metadata.mtime === req.headers["x-qbar-mtime"]) {
    return res.sendStatus(304);
  }
  res.sendFile(
    __dirname + `/public/devices/${req.params.id}.jpg`,
    {},
    (err) => {
      err && res.send(404);
    }
  );
});

app.post("/devices/:id", async (req, res) => {
  try {
    if (!req.files) {
      res.send({
        status: false,
        message: "No file uploaded",
      });
    } else {
      let image = req.files.image;
      if (image.mimetype !== "image/jpeg") {
        return res.sendStatus(400);
      }
      image.mv("./public/devices/" + req.params.id + ".jpg", (err) => {
        const mtime = fs.statSync(
          __dirname + "/public/devices/" + req.params.id + ".jpg"
        ).mtime;
        fs.writeFileSync(
          "./public/devices/" + req.params.id + ".json",
          JSON.stringify({
            interval_millis: req.body.interval_millis || 2000,
            sensitivity: req.body.sensitivity || 0.5,
            mtime,
          }),
          "utf-8"
        );
        res.send({
          status: true,
          message: "File is uploaded",
          data: {
            name: image.name,
            mimetype: image.mimetype,
            size: image.size,
          },
        });
      });
    }
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get("/", (req, res) => {
  fs.readFile("quarter.bmp", (err, buffer) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
    }
    const bmpData = bmp.decode(buffer);
    const byteArray_ = horizontal1bit([...bmpData.data], 120, 160).map((item) =>
      parseInt(item)
    );
    console.log(byteArray_);
    const byteArray = horizontal1bit([...bmpData.data], 120, 160)
      .map((item) => parseInt(item))
      .join(",");
    console.log(byteArray);

    res.status(200).set("Content-type", "text/plain").send(byteArray);
  });
});

function bin2hex(s) {
  var v,
    i,
    f = 0,
    a = [];
  s += "";
  f = s.length;

  for (i = 0; i < f; i++) {
    console.log(s.charCodeAt(i));
    a[i] = s
      .charCodeAt(i)
      .toString(16)
      .replace(/^([\da-f])$/, "0$1");
  }

  return a.join("");
}

app.get("/jpg2hex", (req, res) => {
  fs.readFile("pic2.jpg", (err, buffer) => {
    let result = buffer.map((x) => "0x" + String(x.toString(16)).toUpperCase());
    console.log(new Date().toISOString(), result.map(String));
    if (err) {
      console.error(err);
      res.sendStatus(500);
    }
    res
      .status(200)
      .set("Content-Type", "text/plain")
      .set("Content-Length", result.join(",").length)
      .send(result.join(","));
  });
});

app.post("/qrcode", (req, res) => {
  const data = req.body.data;
  if (data.length <= 320) {
    QR.toBuffer(data, { margin: 1.5, width: 128 }, function (err, pngBuffer) {
      if (err) {
        console.error(err);
        res.sendStatus(500);
      }
      Jimp.read(pngBuffer, function (err, image) {
        if (err) {
          console.error(err);
          res.sendStatus(500);
        } else {
          image.invert();
          image.write("qrcode.bmp");
          res.sendStatus(200);
        }
      });
    });
  } else {
    // bad request because data is too long (max 320 chars)
    res.sendStatus(400);
  }
});

// horizontal1bit function for bmp to bye array conversion
function horizontal1bit(data, canvasWidth, canvasHeight) {
  var output_string = [];
  var output_index = 0;
  var byteIndex = 7;
  var number = 0;
  // format is RGBA, so move 4 steps per pixel
  for (var index = 0; index < data.length; index += 4) {
    // Get the average of the RGB (we ignore A)
    var avg = (data[index + 1] + data[index + 2] + data[index + 3]) / 3;
    if (avg > 128) {
      number += Math.pow(2, byteIndex);
    }
    byteIndex--;
    // if this was the last pixel of a row or the last pixel of the
    // image, fill up the rest of our byte with zeros so it always contains 8 bits
    if (
      (index != 0 && (index / 4 + 1) % canvasWidth == 0) ||
      index == data.length - 4
    ) {
      // for(var i=byteIndex;i>-1;i--){
      // number += Math.pow(2, i);
      // }
      byteIndex = -1;
    }
    // When we have the complete 8 bits, combine them into a hex value
    if (byteIndex < 0) {
      var byteSet = number.toString(16);
      if (byteSet.length == 1) {
        byteSet = "0" + byteSet;
      }
      var b = "0x" + byteSet;
      output_string.push(b);
      output_index++;
      if (output_index >= 16) {
        output_index = 0;
      }
      number = 0;
      byteIndex = 7;
    }
  }
  return output_string;
}

app.listen(3000);
