import sharp from "sharp";
import TextToSVG from "text-to-svg";
import path from "path";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";
import { wrapLongWords } from "../../components/state/utils";

const firebaseConfig = {
    // ...
    // The value of `databaseURL` depends on the location of the database
    databaseURL: "https://letscooklistings-default-rtdb.firebaseio.com/",
};

export const config = {
    api: {
        responseLimit: false,
    },
};

let whocatsTextToSVG;
let montserratTextToSVG;

const initializeTextToSVG = async () => {
    if (!whocatsTextToSVG) {
        whocatsTextToSVG = TextToSVG.loadSync(path.join(process.cwd(), "public", "fonts", "Whocats.ttf"));
    }
    if (!montserratTextToSVG) {
        montserratTextToSVG = TextToSVG.loadSync(path.join(process.cwd(), "public", "fonts", "Montserrat-Regular.ttf"));
    }
};

const splitTextIntoLines = (text, maxWidth, fontSize, font) => {
    const words = text.split(" ");
    const lines = [];
    let currentLine = "";

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = font.getMetrics(testLine, { fontSize });

        if (metrics.width <= maxWidth) {
            currentLine = testLine;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
};

const generateTextPath = (text, fontSize, x, y, font, anchor = "left middle") => {
    const options = { x, y, fontSize, anchor };
    return font.getD(text, options);
};

export default async function handler(req, res) {
    if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Content-Encoding, Accept-Encoding");

        res.status(200).end();
        return;
    }

    await initializeTextToSVG();

    const width = 400;
    const height = 400;

    try {
        const { game } = req.query;

        // Initialize Firebase
        const app = initializeApp(firebaseConfig);

        // Initialize Realtime Database and get a reference to the service
        const database = getDatabase(app);

        let current_date = Math.floor(new Date().getTime() / 1000 / 24 / 60 / 60);
       

        console.log("Starting image generation with dynamic layout and colored text");

        const titleFontSize = 50;
        const padding = Math.round(width * 0.005);

        // Generate paths for all text elements
        const titleWidth = whocatsTextToSVG.getMetrics("BlinkBash!", { fontSize: titleFontSize }).width;
        const titleWidth2 = whocatsTextToSVG.getMetrics("Blink", { fontSize: titleFontSize }).width;

        const blinkPath = generateTextPath(
            "Blink",
            titleFontSize,
            width / 2 - titleWidth / 2,
            padding + titleFontSize / 2 + 10,
            whocatsTextToSVG,
        );
        const bashPath = generateTextPath(
            "Bash!",
            titleFontSize,
            width / 2 - titleWidth / 2 + titleWidth2,
            padding + titleFontSize / 2 + 10,
            whocatsTextToSVG,
        );


        const prompt_db = await get(ref(database, "BlinkBash/prompts/0/"+current_date));
        let prompt_val = prompt_db.val();
        let json = JSON.parse(prompt_val.toString())
        let image_link = json["url"]

        const imageResponse = await fetch(image_link);
        const imageArrayBuffer = await imageResponse.arrayBuffer();
        const imageBuffer = Buffer.from(imageArrayBuffer);

        const centerImageSize = 320; // Adjust this value to change the size of the center image
        const resizedImage = await sharp(imageBuffer)
            .resize(centerImageSize, centerImageSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toBuffer();

        const svgImage = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#5DBBFF;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#0076CC;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)"/>
        <path d="${blinkPath}" fill="white" />
        <path d="${bashPath}" fill="#FFDD56" />
      </svg>
    `;

        const finalImage = await sharp(Buffer.from(svgImage))
            .composite([
                {
                    input: resizedImage,
                    top: Math.round((height - centerImageSize) / 2 + 25),
                    left: Math.round((width - centerImageSize) / 2),
                },
            ])
            .png()
            .toBuffer();

        console.log("Final image generated, size:", finalImage.length);

        res.setHeader("Content-Type", "image/png");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Content-Encoding, Accept-Encoding");
        res.send(finalImage);
    } catch (error) {
        console.error("Error generating image:", error);
        res.status(500).json({ error: "Error generating image", details: error.message });
    }
}