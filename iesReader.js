// A simple parser and manipulator for IES lighting files.

let fs = require("fs");
let readline = require("readline");
let stream = require("stream");

let instream = fs.createReadStream(process.argv[2]);
let outstream = new stream();
let rl = readline.createInterface(instream, outstream);

let lineNumber = 1;
let iesObject = {}

const standardKeywords = ["TEST", "TESTLAB", "TESTDATE", "NEARFIELD", "MANUFAC", "LUMCAT", "LUMINAIRE", "LAMPCAT", "LAMP", "BALLAST", "BALLASTCAT", "MAINTCAT", "DISTRIBUTION", "FLASHAREA", "COLORCONSTANT", "LAMPPOSITION", "ISSUEDATE", "OTHER", "SEARCH", "MORE"];

// Process each line of thie file one line at a time.
rl.on("line", function(line) {
    if (lineNumber === 1) {
        // Read header line
        iesObject.version = line;
        lineNumber++;
    } else {
        // Read Keyword lines (we don't include the '[]' in the object keywords)
        if (line.charAt(0) === '[') {
            let tempString = line.parse("]");
            iesObject[tempString[0]] = tempString[1];
        } else {
            if (line.indexOf("TILT") > -1) {
                
            } else {
                console.log ("parse output in Keywords area");

            }
        }


    }
    

    // Read TILT info

    // #lamps, lumens per lamp, candela multiplier, number of vertical angles, number of horizontal angles, photometric type,
    // units type, width, length, height
    // ballast factor

});

// After the file has been read in, operate!
rl.on("close", function() {

});