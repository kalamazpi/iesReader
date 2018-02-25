// A simple parser and manipulator for IES lighting files.
// This file is designed to map IES files to CSV files that can be easily be manipulated in Excel
// as an editor tool.  It performs limited validation on the IES file.
//
// Limitations: 
// * This version does not support TILT=filename.
// * This version only supports IESNA:LM-63-2002.  Other versions may work by accident.

const fs = require("fs");
const readline = require("readline");
const stream = require("stream");
const supportedVersions = ["IESNA:LM-63-2002"];

let instream = fs.createReadStream(process.argv[2]);
let outstream = new stream();
let rl = readline.createInterface(instream, outstream);

const parserStates = {
    version: 0, 
    keywords: 1,
    lampToLuminaireGeometry: 2,
    numberOfTiltAngles: 3, 
    tiltAngles: 4, 
    multiplyingFactors: 5, 
    unmarkedFields: 6, 
    verticalAnglesArray: 7,
    horizontalAnglesArray: 8,
    candelaValuesTable: 9,
    extraLines: 10
};
let parserState = parserStates.version;

// These const arrays are used to force the ordering of object iterator outputs (which are not
// guaranteed by javascript)
const standardKeywords = ["TEST", "TESTLAB", "TESTDATE", "NEARFIELD", "MANUFAC", "LUMCAT",
    "LUMINAIRE", "LAMPCAT", "LAMP", "BALLAST", "BALLASTCAT", "MAINTCAT",
    "DISTRIBUTION", "FLASHAREA", "COLORCONSTANT", "LAMPPOSITION",
    "ISSUEDATE", "OTHER", "SEARCH", "MORE"];

//const tiltFields = ["lampToLuminaireGeometry", "numberOfTiltAngles", "tiltAngles",
//    "multiplyingFactors"];

const unmarkedFields = ["numOfLamps", "lumensPerLamp", "multiplier", "numberOfVerticalAngles",
    "numberOfHorizontalAngles", "photometricType", "unitsType", "width",
    "length", "height", "ballastFactor", "futureUse", "inputWatts"];

//const lightingArrays = ["verticalAnglesArray", "horizontalAnglesArray", "candelaValuesTable"];

let iesObject = {version: supportedVersions[0], 
    keywords:{TEST: "", TESTLAB: "", ISSUEDATE: "", MANUFAC: "", LUMCAT: "", 
        LUMINAIRE: "", LAMPCAT: "", LAMP: ""},
    tiltFields: {
        TILT: "NONE",
        lampToLuminaireGeometry: 0,
        numberOfTiltAngles: 0,
        tiltAngles: [],
        multiplyingFactors: [],
    },
    unmarkedFields: {
        numOfLamps: 1,
        lumensPerLamp: 10000,
        multiplier: 1,
        numberOfVerticalAngles: 0,
        numberOfHorizontalAngles: 0,
        photometricType: 1,
        unitsType: 1,
        width: 0,
        length: 0,
        height: 0,
        ballastFactor: 0,
        futureUse: 1,
        inputWatts: 1000
    }, 
    verticalAnglesArray: [],
    horizontalAnglesArray: [],
    candelaValuesTable: []
};

let lineNumber = 0;
// 'fieldIndex' is used to iterate through unmarkedFields or tiltFields.
// For example, when parserState == 'unmarkedFields', a fieldIndex of 0 means 'numOfLamps'
let fieldIndex = 0;
// 'columnIndex' is used to iterate through the various tiltAngle and other arrays.
let columnIndex = 0;
// 'rowIndex' is used to iterate through the horizontalAngles in the candelaValuesTable.
let rowIndex = 0;
// 'lastKey' is used to map [MORE] keywords to their associated line.
let lastKey = "";

// Process each line of thie file one line at a time.
rl.on("line", function(line) {
    lineNumber += 1;
    // Clean whitespace from both ends of line.
    line = line.trim();

    console.debug("line %d: %s", lineNumber, line);

    switch (parserState) {
        case parserStates.version:
            // Read header line
            iesObject.version = line;
            // TODO: check to see if version in supportedVersions[].
            if (supportedVersions.includes(line)) {
                // Version is supported
            } else {
                console.error("Error! Version %s not supported.", line);
                console.error("Continuing anyway...");
            }
            // Prepare to receive keywords next.
            parserState = parserStates.keywords;
            break;
        case parserStates.keywords:
            // Process all keywords
            // All keywords must begin with '['. The first line that doesn't should be "TILT"
            // TODO: Rewrite the keyword parsing to be less confusing.
            if (line.charAt(0) === "[") {
                //  Slice(1) is removing "[".
                let tempString = line.slice(1).split("]");
                // Check to see if keyword is valid or custom.
                if (standardKeywords.includes(tempString[0])) {
                    // keyword is good
                } else if (tempString[0].charAt[0] === "_") {
                    // keyword is custom/user
                } else {
                    console.error("Unknown keyword: %s at line %d", tempString[0], lineNumber);
                    console.error("Continuing anyway...");
                }
                if (tempString[0] === "MORE") {
                    // If "MORE", we create a 'lastkey_MORE' array to hold multiple MORE lines
                    // Check to see if lastkey_MORE exists yet or not.
                    if (iesObject.keywords.hasOwnProperty(lastKey + "_MORE")) {
                        // Array exists, so just add another entry to it.
                        iesObject.keywords[lastKey + "_MORE"].push(tempString[1].trim());
                    } else {
                        // Need to create the array and add the entry to it.
                        iesObject.keywords[lastKey + "_MORE"] = [];
                        iesObject.keywords[lastKey + "_MORE"].push(tempString[1].trim());
                    }
                } else {
                    // Record standard or custom keyword.
                    iesObject.keywords[tempString[0]] = tempString[1].trim();
                    lastKey = tempString[0];
                }
            } else {
                if (line.startsWith("TILT=")) {
                    // process TILT=<filename>, INCLUDE, or NONE
                    // note: <filename> is not yet supported
                    if (line.includes("NONE")) {
                        iesObject.tiltFields.TILT = "NONE";
                        parserState = parserStates.unmarkedFields;
                        fieldIndex = 0;
                    } else if (line.includes("INCLUDE")) {
                        iesObject.tiltFields.TILT = "INCLUDE";
                        parserState = parserStates.lampToLuminaireGeometry;
                        fieldIndex = 0;
                    } else {
                        // TILT=<filename> code goes here
                        console.error("Error: external TILT file not supported.");
                        console.error("Aborting...");
                        process.exit(1);
                    }
                } else {
                    console.error("Illegal parser state: expected 'TILT' after Keywords at line ", 
                        lineNumber);
                    console.error("Instead got: ", line);
                    //console.error("Aborting...");
                    //process.exit(1);
                    console.error("Continuing anyway...");
                }
            }                    
            break;
        case parserStates.lampToLuminaireGeometry:
            // Process "lampToLuminaireGeometry"
            // Tilt fields are one field per line except for tiltAngles and multilyingFactors
            //  which can be multiple lines.
            iesObject.tiltFields.lampToLuminaireGeometry = Number(line);
            parserState = parserStates.numberOfTiltAngles;
            break;
        case parserStates.numberOfTiltAngles:
            // Process "numberOfTiltAngles"
            // Tilt fields are one field per line except for tiltAngles and multilyingFactors
            //  which can be multiple lines.
            iesObject.tiltFields.numberOfTiltAngles = Number(line);
            parserState = parserStates.TiltAngles;
            break;
        case parserStates.tiltAngles:
            // Process "tiltAngles" array
            // Tilt fields are one field per line except for tiltAngles and multilyingFactors
            //  which can be multiple lines.
            iesObject.tiltFields.tiltAngles = line.split(" ").map(Number);
            // TODO: check number of tiltAngles against 'numberOfTiltAngles'
            // TODO: support multi-line entries
            parserState = parserStates.multiplyingFactors;
            break;
        case parserStates.multiplyingFactors:
            // Process "multiplyingFactors" array
            // Tilt fields are one field per line except for tiltAngles and multilyingFactors
            //  which can be multiple lines.
            iesObject.tiltFields.multiplyingFactors = line.split(" ").map(Number);
            // TODO: check number of multiplyingFactors against 'numberOfTiltAngles'
            // TODO: support multi-line entries
            parserState = parserStates.unmarkedFields;
            fieldIndex = 0;
            break;
        case parserStates.unmarkedFields:
            // Process all unmarked fields up through inputWatts
            // Break line into multiple fields (if any).
            // For each field: store field and update field index.
            // Terminate when fieldIndex == number of unmarkedFields.
            // Break line into multiple (numeric) fields.
            line = line.split(" ").map(Number);
            for (let i in line) {
                // Find the key
                let key = "";
                key = unmarkedFields[Number(i) + fieldIndex];
                // Store the unmarked field for this key
                iesObject.unmarkedFields[key] = line[i];
            }
            // Update fieldIndex for next line.
            fieldIndex += line.length;
            // Check for end of unmarked fields.
            if (fieldIndex < unmarkedFields.length) {
                // keep going with the unmarked fields
            } else {
                // go to next section
                fieldIndex = 0;
                parserState = parserStates.verticalAnglesArray;
            }
            break;
        case parserStates.verticalAnglesArray:
            // Process verticalAngles
            // Break line into multiple values (if any).
            // For each value: store value in array and update array index.
            // Terminate when array index == expected size.
            // Break line into multiple (numeric) fields.
            line = line.split(" ").map(Number);
            for (let i in line) {
                // Store the values for this line
                iesObject.verticalAnglesArray[Number(i) + columnIndex] = line[i];
            }
            // Update columnIndex for next line.
            columnIndex += line.length;
            // Check for end of unmarked fields.
            if (columnIndex < iesObject.unmarkedFields.numberOfVerticalAngles) {
                // keep going with the array values
            } else {
                // go to next section
                columnIndex = 0;
                parserState = parserStates.horizontalAnglesArray;
            }
            break;
        case parserStates.horizontalAnglesArray:
            // Process horizontalAngles
            // Break line into multiple values (if any).
            // For each value: store value in array and update array index.
            // Terminate when array index == expected size.
            // Break line into multiple (numeric) fields.
            line = line.split(" ").map(Number);
            for (let i in line) {
                // Store the values for this line
                iesObject.horizontalAnglesArray[Number(i) + rowIndex] = line[i];
            }
            // Update rowIndex for next line.
            rowIndex += line.length;
            // Check for end of unmarked fields.
            if (rowIndex < iesObject.unmarkedFields.numberOfHorizontalAngles) {
                // keep going with the array values
            } else {
                // go to next section
                rowIndex = 0;
                parserState = parserStates.candelaValuesTable;
            }
            break;
        case parserStates.candelaValuesTable:
            // Process candelaValues
            // Each line will only contain entries for one row, but
            //  may not contain all the entries for that row.
            // Break line into multiple values (if any).
            // For each value: store value in array and update array index.
            // Terminate when array index == expected size.
            // Break line into multiple (numeric) fields.
            line = line.split(" ").map(Number);
            for (let i in line) {
                // Store the values for this line
                if (iesObject.candelaValuesTable.hasOwnProperty(rowIndex)) {
                    iesObject.candelaValuesTable[rowIndex][Number(i) + columnIndex] = line[i];    
                } else {
                    iesObject.candelaValuesTable[rowIndex] = [];
                    iesObject.candelaValuesTable[rowIndex][Number(i) + columnIndex] = line[i];
                }
            }
            // Update columnIndex for next line.
            columnIndex += line.length;
            // Check for end of unmarked fields.
            if (columnIndex < iesObject.unmarkedFields.numberOfVerticalAngles) {
                // keep going with the array values
            } else {
                // go to next row
                columnIndex = 0;
                rowIndex += 1;
                // iesObject.candelaValuesTable[rowIndex] = [];
                if (rowIndex < iesObject.unmarkedFields.numberOfHorizontalAngles) {
                    // keep going with the array values
                } else {
                    rowIndex = 0;
                    parserState = parserStates.extraLines;
                }
            }
            break;
        case parserStates.extraLines:
            // Process any extra lines in the file
            console.log("Extra line found at ", lineNumber);
            break;
        default:
            // throw error
            console.error("Illegal parser state at line ", lineNumber);
            console.error("Aborting...");
            process.exit(1);
    }
});

// After the file has been read in, operate!
rl.on("close", function() {
    // do something!
    console.log("Finished parsing input file.");
    // Write out the IES file
    // First line is the IES file version
    console.log(iesObject.version);

    // next we write out each of the keywords in any order
    // TODO: Handle MORE arrays.
    let tempKeys = Object.keys(iesObject.keywords);
    for (i in tempKeys) {
        let tempString = "[" + tempKeys[i] + "] ";
        // Handle [MORE] keywords
        if (tempKeys[i].endsWith("MORE")) {
            for (j in iesObject.keywords[tempKeys[i]]) {
                tempString = "[MORE] " + iesObject.keywords[tempKeys[i]][j];
                console.log(tempString);
            }
        } else {
            // Normal keywords.
            // TODO: Print Keywords in order that they were originally read or the order of 
            //  the standardKeywords[] array.
            tempString += iesObject.keywords[tempKeys[i]];
            console.log(tempString);
        }
    }
});