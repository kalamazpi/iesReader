// A simple parser and manipulator for IES lighting files.



const fs = require("fs");
const readline = require("readline");
const stream = require("stream");
const supportedVersions = ["IESNA:LM-63-2002"];

let instream = fs.createReadStream(process.argv[2]);
let outstream = new stream();
let rl = readline.createInterface(instream, outstream);

console.debug("Processing file: ", process.argv[2]);

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

const tiltFields = ["lampToLuminaireGeometry", "numberOfTiltAngles", "tiltAngles",
    "multiplyingFactors"];

const unmarkedFields = ["numOfLamps", "lumensPerLamp", "multiplier", "numberOfVerticalAngles",
    "numberOfHorizontalAngles", "photometricType", "unitsType", "width",
    "length", "height", "ballastFactor", "futureUse", "inputWatts"];

const lightingArrays = ["verticalAnglesArray", "horizontalAnglesArray", "candelaValuesTable"];

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

// TODO: examine extension of input file name to determine the direction of the translation.

rl.on("line", function (line) {
    if (process.argv[2].toLowerCase().endsWith(".ies")) {
        readIES(line);
    } else {
        readCSV(line);
    }
});

rl.on("close", function () {
    if (process.argv[2].toLowerCase().endsWith(".ies")) {
        writeCSV ();
    } else {
        writeIES ();
    }
});

function readCSV(line) {
    lineNumber += 1;
    // Clean whitespace from both ends of line.
    line = line.trim();
    // Clean extra ',' from end of line.
    for (let i = line.length - 1; i > 0; i -= 1) {
        if (line.charAt(i) === ",") {
            // keep going
        } else {
            line = line.slice(0,i + 1);
            break;
        }
    }

    console.debug("line %d: %s", lineNumber, line);

    // Split using ',' as delimeter
    line = line.split(",");

    let keyArray = [];
    let keyString = "";

    switch (parserState) {
        case parserStates.version:
            // Read version, which should be in [1]. "IES file version" is in [0].
            if (line.hasOwnProperty("1")) {
                iesObject.version = line[1];
            } else {
                iesObject.version = supportedVersions[0];
            }
            if (supportedVersions.includes(iesObject.version)) {
                // Version is supported
            } else {
                console.error("Error! Version %s not supported.", iesObject.version);
                console.error("Continuing anyway...");
            }
            // Prepare to receive keywords next.
            parserState = parserStates.keywords;
            break;
        case parserStates.keywords:
            // Process all keywords
            // Keywords will be in line[0] and values in line[1].  Some values may also extend
            // beyond [1] if the source text contained ',', so we will append them all
            // back together.
            // All keywords must begin with '['. The first line that doesn't should be "TILT"
            // TODO: Rewrite the keyword parsing to be less confusing.
            // Join all line[1] to line[n] and store in line[1].
            // Copy line array into keyArray.
            keyArray = line.slice();
            // delete first entry
            keyArray.splice(0,1);
            // TODO: The join operation below joins together strings which were previously separated
            //  because they contained a comma.  In the join process, the comma is lost.  Instead,
            //  need to see if we are joining non-empty strings, and if so, insert a comma between
            //  them.
            keyString = keyArray.join("");
            if (line[0].charAt(0) === "[") {
                //  Slice(1) is removing "[". and split("]") is removing "]"
                let tempString = line[0].slice(1).split("]");
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
                        iesObject.keywords[lastKey + "_MORE"].push(keyString);
                    } else {
                        // Need to create the array and add the entry to it.
                        iesObject.keywords[lastKey + "_MORE"] = [];
                        iesObject.keywords[lastKey + "_MORE"].push(keyString);
                    }
                } else {
                    // Record standard or custom keyword.
                    iesObject.keywords[tempString[0]] = keyString;
                    lastKey = tempString[0];
                }
            } else {
                if (line[0].startsWith("TILT=")) {
                    // process TILT=<filename>, INCLUDE, or NONE
                    // note: <filename> is not yet supported
                    if (line[0].includes("NONE")) {
                        iesObject.tiltFields.TILT = "NONE";
                        parserState = parserStates.unmarkedFields;
                        fieldIndex = 0;
                    } else if (line[0].includes("INCLUDE")) {
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
            iesObject.tiltFields.lampToLuminaireGeometry = Number(line[1]);
            parserState = parserStates.numberOfTiltAngles;
            break;
        case parserStates.numberOfTiltAngles:
            // Process "numberOfTiltAngles"
            iesObject.tiltFields.numberOfTiltAngles = Number(line[1]);
            parserState = parserStates.tiltAngles;
            break;
        case parserStates.tiltAngles:
            // Process "tiltAngles" array
            iesObject.tiltFields.tiltAngles = line.slice(1);
            // TODO: check number of tiltAngles against 'numberOfTiltAngles'
            parserState = parserStates.multiplyingFactors;
            break;
        case parserStates.multiplyingFactors:
            // Process "multiplyingFactors" array
            // Tilt fields are one field per line except for tiltAngles and multilyingFactors
            //  which can be multiple lines.
            iesObject.tiltFields.multiplyingFactors = line.slice(1);
            // TODO: check number of multiplyingFactors against 'numberOfTiltAngles'
            parserState = parserStates.unmarkedFields;
            fieldIndex = 0;
            break;
        case parserStates.unmarkedFields:
            // Unmarked field key in line[0] and value in line[1].
            // Check to see if key in line[0] matches a known unmarked Field, and if so
            // store it.  Otherwise throw an error.
            // TODO: Check to see if line[1] exists before referencing it.
            if (unmarkedFields.includes(line[0])) {
                iesObject.unmarkedFields[line[0]] = line[1];
            } else {
                console.error("Error. Unknown key %d detected on line %d", line[0], lineNumber);
                console.error("Continuing anyway...");
            }
            // Check for end of unmarked fields.
            if (line[0] === "inputWatts") {
                // go to next section
                parserState = parserStates.verticalAnglesArray;
            } else {
                // keep going with the unmarked fields
            }
            break;
        case parserStates.verticalAnglesArray:
            // Process verticalAngles
            // verticalAnglesArray,0,1,2,3,4....
            // Copy line into verticalAnglesArray and drop the 'verticalanglesArray' entry.
            iesObject.verticalAnglesArray = line.slice(1);
            parserState = parserStates.horizontalAnglesArray;
            break;
        case parserStates.horizontalAnglesArray:
            // Process horizontalAngles
            // horizontalAnglesArray,0,1,2,3,4....
            // Copy line into horizontalAnglesArray and drop the 'horizontalAnglesArray' entry.
            iesObject.horizontalAnglesArray = line.slice(1);
            parserState = parserStates.candelaValuesTable;
            break;
        case parserStates.candelaValuesTable:
            // Process candelaValues
            // First line contains repeat of vertical angles at offset [1].
            // First column of each following row contains horizontal angle followed by candela
            // values.
            // For now, we leave the horizontal and vertical angles alone and just read in the
            // candela values.
            // rowIndex and columnIndex are assumed 0 on first run.
            if (line[0] === "candelaValuesTable") {
                // skip first line
                break;
            } else {
                // TODO: see if this check for hasOwnProperty is needed or not.
                if (iesObject.candelaValuesTable.hasOwnProperty(rowIndex)) {
                    iesObject.candelaValuesTable[rowIndex] = line.slice(1);
                } else {
                    iesObject.candelaValuesTable[rowIndex] = [];
                    iesObject.candelaValuesTable[rowIndex] = line.slice(1);
                }
            }
            rowIndex += 1;
            if (rowIndex < iesObject.unmarkedFields.numberOfHorizontalAngles) {
                // keep going with the array values
            } else {
                rowIndex = 0;
                parserState = parserStates.extraLines;
            }
            break;
            // TODO: Validate counts for horizontalAngles, verticalAngles, and candelaValuesTable
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
}

function writeCSV () {
    // do something!
    console.debug("Finished parsing input file.");
    // Write out the IES file
    // First line is the IES file version
    console.log("IES file version," + iesObject.version);

    // next we write out each of the keywords in any order
    // TODO: Need to mask/escape any ',' in the keyword values to avoid Excel breaking them into
    //  multiple columns.
    let tempKeys = Object.keys(iesObject.keywords);
    for (let i in tempKeys) {
        let tempString = "[" + tempKeys[i] + "],";
        // Handle [MORE] keywords
        if (tempKeys[i].endsWith("MORE")) {
            for (let j in iesObject.keywords[tempKeys[i]]) {
                tempString = "[MORE]," + iesObject.keywords[tempKeys[i]][j];
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
    // Handle TILT
    // TODO: Add support for TILT=filename
    console.log("TILT=" + iesObject.tiltFields.TILT);
    if (iesObject.tiltFields.TILT === "INCLUDE") {
        // Write out TILT unmarked fields in order
        // Handle lampToLuminaireGeometry and numberOfTiltAngles
        console.log(tiltFields[0] + "," + iesObject.tiltFields[tiltFields[0]]);
        console.log(tiltFields[1] + "," + iesObject.tiltFields[tiltFields[1]]);
        // Handle tiltAngles. Write each separated by comma.
        // TODO: Handle multi-line tiltAngles
        let tempString = tiltFields[2];
        for (let i = 0; i < iesObject.tiltFields.tiltAngles.length; i += 1) {
            tempString += "," + iesObject.tiltFields.tiltAngles[i];
        }
        console.log (tempString);
        // Handle multiplyingFactors. Write each separated by comma.
        // TODO: Handle multi-line multiplyingFactors
        tempString = tiltFields[3];
        for (let i = 0; i < iesObject.tiltFields.multiplyingFactors.length; i += 1) {
            tempString += "," + iesObject.tiltFields.multiplyingFactors[i];
        }
        console.log (tempString);
    } else if (iesObject.tiltFields.TILT === "NONE") {
        // Nothing more to do here.
    } else {
        // TODO: Add support for TILT=filename and error checking here
        console.error("Error.  Unsupported TILT condition on file write.");
        console.error("Continuing anyway...");
    }

    // Write out unmarked fields in order, one per line
    let tempString = iesObject.unmarkedFields[unmarkedFields[0]];
    for (let i in unmarkedFields) {
        tempString = unmarkedFields[i] + "," + iesObject.unmarkedFields[unmarkedFields[i]];
        console.log(tempString);
    }

    // Write out verticalAngles, all on one line
    tempString = lightingArrays[0];
    for (let i = 0; i < iesObject.verticalAnglesArray.length; i += 1) {
        tempString += "," + iesObject.verticalAnglesArray[i];
    }
    console.log(tempString);

    // Write out horizontalAngles, all on one line
    tempString = lightingArrays[1];
    for (let i = 0; i < iesObject.horizontalAnglesArray.length; i += 1) {
        tempString += "," + iesObject.horizontalAnglesArray[i];
    }
    console.log(tempString);

    // Write out candelaValuesTable:
    // candelaValuesTable,verticalAngle[0],verticalAngle[1],...
    // horizontalAngle[0],[0][0],[0][1]...
    // horizontalAngle[1],[1][0],[1][1]...
    // Print row of vertical angles:
    tempString = lightingArrays[2];
    for (let i = 0; i < iesObject.unmarkedFields.numberOfVerticalAngles; i += 1) {
        tempString += "," + iesObject.verticalAnglesArray[i];
    }
    console.log(tempString);
    // Print row of Candela info, starting with horizontal Angle
    for (let horIndex = 0; horIndex < iesObject.unmarkedFields.numberOfHorizontalAngles; horIndex += 1) {
        tempString = iesObject.horizontalAnglesArray[horIndex];
        for (let verIndex = 0; verIndex < iesObject.unmarkedFields.numberOfVerticalAngles; verIndex += 1) {
            tempString += "," + iesObject.candelaValuesTable[horIndex][verIndex];
        }
        console.log(tempString);
    }
    console.debug("Finished.");
}

function readIES (line) {
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
            parserState = parserStates.tiltAngles;
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
            // TODO: Validate counts for horizontalAngles, verticalAngles, and candelaValuesTable
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
}

// After the file has been read in, write an IES file!
function writeIES () {
    // do something!
    console.debug("Finished parsing input file.");
    // Write out the IES file
    // First line is the IES file version
    console.log(iesObject.version);

    // next we write out each of the keywords in any order
    let tempKeys = Object.keys(iesObject.keywords);
    for (let i in tempKeys) {
        let tempString = "[" + tempKeys[i] + "] ";
        // Handle [MORE] keywords
        if (tempKeys[i].endsWith("MORE")) {
            for (let j in iesObject.keywords[tempKeys[i]]) {
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
    // Handle TILT
    // TODO: Add support for TILT=filename
    console.log("TILT=" + iesObject.tiltFields.TILT);
    if (iesObject.tiltFields.TILT === "INCLUDE") {
        // Write out TILT unmarked fields in order
        // Handle lampToLuminaireGeometry and numberOfTiltAngles
        console.log(iesObject.tiltFields[tiltFields[0]]);
        console.log(iesObject.tiltFields[tiltFields[1]]);
        // Handle tiltAngles. Write each separated by space, then remove last space.
        // TODO: Handle multi-line tiltAngles
        let tempString = "";
        for (let i in iesObject.tiltFields.tiltAngles) {
            tempString += iesObject.tiltFields.tiltAngles[i] + " ";
        }
        tempString = tempString.trim();        
        console.log (tempString);
        // Handle multiplyingFactors. Write each separated by space, then remove last space.
        // TODO: Handle multi-line multiplyingFactors
        tempString = "";
        for (let i in iesObject.tiltFields.multiplyingFactors) {
            tempString += iesObject.tiltFields.multiplyingFactors[i] + " ";
        }
        tempString = tempString.trim();        
        console.log (tempString);
    } else if (iesObject.tiltFields.TILT === "NONE") {
        // Nothing more to do here.
    } else {
        // TODO: Add support for TILT=filename and error checking here
        console.error("Error.  Unsupported TILT condition on file write.");
        console.error("Continuing anyway...");
    }

    // Write out unmarked fields (first 10) in order
    let tempString = "";
    for (let i = 0; i < 10; i += 1) {
        tempString += iesObject.unmarkedFields[unmarkedFields[i]] + " ";
    }
    // trim last space
    tempString = tempString.trim();
    // write them out
    console.log(tempString);
    // Write out remaining 3 unmarked fields in order
    tempString = "";
    for (let i = 10; i < 13; i += 1) {
        tempString += iesObject.unmarkedFields[unmarkedFields[i]] + " ";
    }
    // trim last space
    tempString = tempString.trim();
    // write them out
    console.log(tempString);

    // Write out verticalAngles, no more than 120 chars per line
    tempString = "";
    for (let i = 0; i < iesObject.verticalAnglesArray.length; i += 1) {
        tempString += iesObject.verticalAnglesArray[i] + " ";
        // TODO: Move '120' to a constant at top of file.
        if (tempString.length > 120) {
            tempString = tempString.trim();
            console.log(tempString);
            tempString = "";
        }
    }
    // Handle last short line
    if (tempString.length > 0) {
        tempString = tempString.trim();
        console.log(tempString);
    }
    // Write out horizontalAngles, no more than 120 chars per line
    tempString = "";
    for (let i = 0; i < iesObject.horizontalAnglesArray.length; i += 1) {
        tempString += iesObject.horizontalAnglesArray[i] + " ";
        // TODO: Move '120' to a constant at top of file.
        if (tempString.length > 120) {
            tempString = tempString.trim();
            console.log(tempString);
            tempString = "";
        }
    }
    // Handle last short line
    if (tempString.length > 0) {
        tempString = tempString.trim();
        console.log(tempString);
    }
    // Write out candelaValuesTable, no more than 120 chars per line
    tempString = "";
    for (let horIndex = 0; horIndex < iesObject.unmarkedFields.numberOfHorizontalAngles; horIndex += 1) {
        for (let verIndex = 0; verIndex < iesObject.unmarkedFields.numberOfVerticalAngles; verIndex += 1) {
            tempString += iesObject.candelaValuesTable[horIndex][verIndex] + " ";
            // TODO: Move '120' to a constant at top of file.
            if (tempString.length > 120) {
                tempString = tempString.trim();
                console.log(tempString);
                tempString = "";
            }
        }
        // Handle last short line for this row
        if (tempString.length > 0) {
            tempString = tempString.trim();
            console.log(tempString);
            tempString = "";
        }
    }
    console.debug("Finished.");
}
