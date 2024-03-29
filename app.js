requirejs.config({
    baseUrl: "lib",
    paths: {
        app: "../app",
        jquery: "jquery-3.5.1.min",
        selection: "selection.min",
        dompurify: "purify",
    },
});

var maxWidth = [];
var maxHeight = [];

requirejs(["turndown"]);
requirejs(["joplin-turndown-plugin-gfm_mod"]);
requirejs(["dompurify"]);

require(["jquery"], function($) {
    $(document).ready(function() {
        $("#editableDiv").empty();
        var DOMPurify = require("dompurify");
        turndownService = new TurndownService();
        gfm = turndownPluginGfm.gfm;
        turndownService.use(gfm);
        // var maxWidth = [];
        var editableDiv = document.getElementById("editableDiv");
        var pastedData;
        var cleanPaste;

        function handlepaste(e) {
            var types, savedContent;

            // Browsers that support the 'text/html' type in the Clipboard API (Chrome, Firefox 22+)
            if (
                e &&
                e.clipboardData &&
                e.clipboardData.types &&
                e.clipboardData.getData
            ) {
                // Check for 'text/html' in types list. See abligh's answer below for deatils on
                // why the DOMStringList bit is needed. We cannot fall back to 'text/plain' as
                // Safari/Edge don't advertise HTML data even if it is available
                types = e.clipboardData.types;
                if (
                    (types instanceof DOMStringList && types.contains("text/html")) ||
                    (types.indexOf && types.indexOf("text/html") !== -1)
                ) {
                    // Extract data and pass it to callback
                    pastedData = e.clipboardData.getData("text/html");

                    setTimeout(function() {
                        cleanPaste = DOMPurify.sanitize(pastedData, {
                            ALLOWED_TAGS: [
                                "table",
                                "tbody",
                                "strong",
                                "em",
                                "br",
                                "p",
                                "td",
                                "tr", ,
                                "img",
                                "a",
                                "th",
                            ],
                        });
                        //console.log(cleanPaste);
                        processPaste(editableDiv, cleanPaste);
                        //processPaste(editableDiv, pastedData);
                    }, 100);

                    // Stop the data from actually being pasted
                    e.stopPropagation();
                    e.preventDefault();
                    return false;
                }
            }

            // Everything else: Move existing element contents to a DocumentFragment for safekeeping
            savedContent = document.createDocumentFragment();
            while (editableDiv.childNodes.length > 0) {
                savedContent.appendChild(editableDiv.childNodes[0]);
            }

            // Then wait for browser to paste content into it and cleanup
            waitForPastedData(editableDiv, savedContent);
            return true;
        }

        function waitForPastedData(elem, savedContent) {
            // If data has been processes by browser, process it
            if (elem.childNodes && elem.childNodes.length > 0) {
                // Retrieve pasted content via innerHTML
                // (Alternatively loop through elem.childNodes or elem.getElementsByTagName here)
                var pastedData = elem.innerHTML;
                var cleanPaste = DOMPurify.sanitize(pastedData, {
                    ALLOWED_TAGS: [
                        "table",
                        "tbody",
                        "strong",
                        "em",
                        "br",
                        "p",
                        "td",
                        "tr",
                        "img",
                        "a",
                        "th",
                    ],
                });

                // Restore saved content
                elem.innerHTML = "";
                elem.appendChild(savedContent);

                // Call callback
                processPaste(elem, cleanPaste);
                //processPaste(elem, pastedData);
            }

            // Else wait 20ms and try again
            else {
                setTimeout(function() {
                    waitForPastedData(elem, savedContent);
                }, 20);
            }
        }

        function processPaste(elem, pastedData) {
            turndownService.addRule("as", {
                filter: "a",
                replacement: function(content) {
                    return " " + content + " ";
                },
            });

            turndownService.addRule("ima", {
                filter: "img",
                replacement: function(content) {
                    return "()";
                },
            });

            var processedText = turndownService.turndown(pastedData);

            $("#editableDiv").html(processedText);
            $("#editableDiv").addClass("box-wrap");
            $("#editableDiv").addClass("crosshair");

            elem.focus();
        }

        // Modern browsers. Note: 3rd argument is required for Firefox <= 6
        if (editableDiv.addEventListener) {
            editableDiv.addEventListener("paste", handlepaste, false);
        }
        // IE <= 8
        else {
            editableDiv.attachEvent("onpaste", handlepaste);
        }

        $("#clear").click(function() {
            $("#editableDiv").empty();
            $("#editableDiv").removeClass("box-wrap");
            $("#editableDiv").removeClass("crosshair");
            $("#finishedText").empty();
            $("#finishedText").removeClass("whitebackground");
            $("#finishedText").addClass("lightgreybackground");
        });
        $("#row_lines").prop("checked", false);

        $("input[type=radio][name=process_mode]").change(function() {
            $("#finishedText").empty();
            $("#finishedText").removeClass("whitebackground");
            $("#finishedText").addClass("lightgreybackground");
            maxWidth = [];
            maxHeight = [];
            processPaste(editableDiv, pastedData);
        });
    });
});

// Selection library
// https://github.com/Simonwep/selection

require(["selection"], function(Selection) {
    var selection = Selection.create({
            // Class for the selection-area
            class: "selection",

            // All elements in this container can be selected
            selectables: [".box-wrap > div"],

            // The container is also the boundary in this case
            boundaries: [".box-wrap"],
        })
        .on("start", ({ inst, selected, oe }) => {
            // Remove class if the user isn't pressing the control key or ⌘ key
            if (!oe.ctrlKey && !oe.metaKey) {
                // Unselect all elements
                for (const el of selected) {
                    el.classList.remove("selected");
                    inst.removeFromSelection(el);
                }

                // Clear previous selection
                inst.clearSelection();
            }
        })
        .on("move", ({ changed: { removed, added } }) => {
            // Add a custom class to the elements that where selected.
            for (const el of added) {
                el.classList.add("selected");
            }

            // Remove the class from elements that where removed
            // since the last selection
            for (const el of removed) {
                el.classList.remove("selected");
            }
        })
        .on("stop", ({ inst }) => {
            // Remember selection in case the user wants to add smth in the next one
            inst.keepSelection();
            var Markdown,
                textTable,
                simplerText = false;
            switch ($("input[name='process_mode']:checked").val()) {
                case "markdown":
                    Markdown = true;
                    break;
                case "text_table":
                    textTable = true;
                    break;
                case "simpler_text":
                    simplerText = true;
            }

            var selection = inst.getSelection();
            var line = 0;
            var x, y;
            var maxx = 0;
            var minx = 9999999;
            var miny = 9999999;
            var newDiv = document.createElement("div");
            var newContent = document.createTextNode("\n");
            newDiv.appendChild(newContent);
            x = 0;
            y = 0;
            line = parseInt($(selection[0]).attr("y"));
            // Determine which columns where selected
            $.each(selection, function(index, item) {
                x = parseInt($(item).attr("x"));
                y = parseInt($(item).attr("y"));

                if (x > maxx) {
                    maxx = x;
                }

                if (x < minx) {
                    minx = x;
                }

                if (y < miny) {
                    miny = y;
                }

                if (y == line) {} else {
                    selection.splice(index, 0, newDiv);
                    line++;
                }
            });

            var finishedText = $(selection).text();
            finishedText = htmlEntities(finishedText);
            var final = "<pre>";
            var finishedLines = finishedText.split("\n");

            // Create divider for heading rows
            var divider = "";
            var bottomBorder = "";
            var dividerPad = "";
            var borderPad = "";
            var partDivider = "";
            var partBottom = "";
            var leftPipe = "";
            var rightPipe = "";
            if (Markdown) {
                dividerPad = "-";
                headerRowPos = miny + 1;
            } else {
                dividerPad = "=";
                borderPad = "-";
                // Find out in which row we made the cut so the header line is properly positioned in case of multi-line rows
                var headerRowPos = 0;
                var currContentHeight = 0;

                for (let i = 0; i < maxHeight.length; i++) {
                    if (miny <= i + currContentHeight) {
                        headerRowPos = i + currContentHeight;
                        break;
                    } else {
                        currContentHeight += maxHeight[i];
                    }
                }
            }

            maxWidth.forEach((width) => {
                divider += "|" + dividerPad.repeat(width);
                bottomBorder += "+" + borderPad.repeat(width);
            });
            divider += "|";
            bottomBorder += "+";

            if (divider.substr(minx, 1) != "|") {
                partDivider = "|" + divider.substr(minx, maxx - minx + 1);
                partBottom = "+" + bottomBorder.substr(minx, maxx - minx + 1);
                leftPipe = "|";
            } else {
                partDivider = divider.substr(minx, maxx - minx + 1);
                partBottom = bottomBorder.substr(minx, maxx - minx + 1);
                leftPipe = "";
            }
            if (divider.substr(maxx, 1) != "|" && !simplerText) {
                partDivider += "|";
                partBottom += "+";
                rightPipe = "|";
            } else {
                rightPipe = "";
            }

            maxx = 0;
            minx = 9999999;
            var currRow = 0;
            var currContentHeight = maxHeight[currRow]; // Equal to the height of the first row
            //linesTrim.forEach((line, lineNumber) => {
            finishedLines.forEach((line, lineNumber) => {
                if (lineNumber == headerRowPos - miny) {
                    //console.log(headerRowPos - miny);
                    if (Markdown || (textTable && lineNumber > 0)) {
                        // Cut did not happen right at a line
                        final +=
                            "<span style='font-family:monospace;'>" +
                            // divider.padEnd(line.length, dividerPad) +
                            partDivider +
                            "</span><br/>";
                        console.log(partDivider);
                        console.log("Markdown: " + Markdown);
                    }
                    // else {
                    //   // Cut happened right at a line so keep it
                    //   final +=
                    //     "<span style='font-family:monospace;'>" +
                    //     partBottom +
                    //     "</span><br/>";
                    // }
                }

                if (
                    Markdown ||
                    lineNumber != headerRowPos - miny ||
                    (lineNumber == headerRowPos - miny && (!Markdown || lineNumber == 0))
                ) {
                    final +=
                        "<span style='font-family:monospace;'>" +
                        leftPipe +
                        line +
                        rightPipe +
                        "</span><br/>";
                }
            });
            if (textTable == true) {
                final +=
                    "<span style='font-family:monospace;'>" + partBottom + "</span><br/>";
                console.log(partBottom);
            }
            final += "</pre>";
            $("#finishedText").html(final);
            $("#finishedText").removeClass("lightgreybackground");
            $("#finishedText").addClass("whitebackground");
        });

    function htmlEntities(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
});