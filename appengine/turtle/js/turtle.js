/**
 * @license
 * Copyright 2012 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview JavaScript for Turtle game.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Turtle');

goog.require('Blockly.Comment');
goog.require('Blockly.FieldColour');
goog.require('Blockly.FlyoutButton');
goog.require('Blockly.Toolbox');
goog.require('Blockly.Trashcan');
goog.require('Blockly.utils.math');
goog.require('Blockly.VerticalFlyout');
goog.require('Blockly.ZoomControls');
goog.require('BlocklyDialogs');
goog.require('BlocklyGallery');
goog.require('BlocklyGames');
goog.require('BlocklyInterface');
goog.require('Slider');
goog.require('Turtle.Answers');
goog.require('Turtle.Blocks');
goog.require('Turtle.soy');


BlocklyGames.NAME = 'turtle';

Turtle.HEIGHT = 400;
Turtle.WIDTH = 400;

/**
 * PID of animation task currently executing.
 * @type !Array.<number>
 */
Turtle.pidList = [];

/**
 * Number of milliseconds that execution should delay.
 * @type number
 */
Turtle.pause = 0;

/**
 * JavaScript interpreter for executing program.
 * @type Interpreter
 */
Turtle.interpreter = null;

/**
 * Should the turtle be drawn?
 * @type boolean
 */
Turtle.visible = true;

/**
 * Is the drawing ready to be submitted to gallery?
 * @type boolean
 */
Turtle.canSubmit = false;

/**
 * Initialize Blockly and the turtle.  Called on page load.
 */
Turtle.init = function() {
  // Render the Soy template.
  document.body.innerHTML = Turtle.soy.start({}, null,
      {lang: BlocklyGames.LANG,
       level: BlocklyGames.LEVEL,
       maxLevel: BlocklyGames.MAX_LEVEL,
       html: BlocklyGames.IS_HTML});

  BlocklyInterface.init();

  var rtl = BlocklyGames.isRtl();
  var blocklyDiv = document.getElementById('blockly');
  var visualization = document.getElementById('visualization');
  var onresize = function(e) {
    var top = visualization.offsetTop;
    blocklyDiv.style.top = Math.max(10, top - window.pageYOffset) + 'px';
    blocklyDiv.style.left = rtl ? '10px' : '420px';
    blocklyDiv.style.width = (window.innerWidth - 440) + 'px';
  };
  window.addEventListener('scroll', function() {
    onresize(null);
    Blockly.svgResize(BlocklyGames.workspace);
  });
  window.addEventListener('resize', onresize);
  onresize(null);

  if (BlocklyGames.LEVEL < BlocklyGames.MAX_LEVEL) {
    Blockly.FieldColour.COLUMNS = 3;
    Blockly.FieldColour.COLOURS =
        ['#ff0000', '#ffcc33', '#ffff00',
         '#009900', '#3333ff', '#cc33cc',
         '#ffffff', '#999999', '#000000'];
  }

  var toolbox = document.getElementById('toolbox');
  BlocklyGames.workspace = Blockly.inject('blockly',
      {'media': 'third-party/blockly/media/',
       'oneBasedIndex': false,
       'rtl': rtl,
       'toolbox': toolbox,
       'trashcan': true,
       'zoom': BlocklyGames.LEVEL == BlocklyGames.MAX_LEVEL ?
           {'controls': true, 'wheel': true} : null});
  // Prevent collisions with user-defined functions or variables.
  Blockly.JavaScript.addReservedWords('moveForward,moveBackward,' +
      'turnRight,turnLeft,penUp,penDown,penWidth,penColour,' +
      'hideTurtle,showTurtle,print,font');

  if (document.getElementById('submitButton')) {
    BlocklyGames.bindClick('submitButton', Turtle.submitToGallery);
  }

  // Initialize the slider.
  var sliderSvg = document.getElementById('slider');
  Turtle.speedSlider = new Slider(10, 35, 130, sliderSvg);

  if (BlocklyGames.LEVEL == BlocklyGames.MAX_LEVEL) {
    var defaultXml =
        '<xml>' +
          '<block type="turtle_move" x="70" y="70">' +
            '<value name="VALUE">' +
              '<shadow type="math_number">' +
                '<field name="NUM">10</field>' +
              '</shadow>' +
            '</value>' +
          '</block>' +
        '</xml>';
  } else {
    var defaultXml =
        '<xml>' +
          '<block type="turtle_move_internal" x="70" y="70">' +
            '<field name="VALUE">100</field>' +
          '</block>' +
        '</xml>';
  }
  BlocklyInterface.loadBlocks(defaultXml,
      BlocklyGames.LEVEL != BlocklyGames.MAX_LEVEL || Turtle.transform10);

  Turtle.ctxDisplay = document.getElementById('display').getContext('2d');
  Turtle.ctxAnswer = document.getElementById('answer').getContext('2d');
  Turtle.ctxScratch = document.getElementById('scratch').getContext('2d');
  Turtle.drawAnswer();
  Turtle.reset();

  BlocklyGames.bindClick('runButton', Turtle.runButtonClick);
  BlocklyGames.bindClick('resetButton', Turtle.resetButtonClick);

  // Preload the win sound.
  BlocklyGames.workspace.getAudioManager().load(
      ['turtle/win.mp3', 'turtle/win.ogg'], 'win');
  // Lazy-load the JavaScript interpreter.
  BlocklyInterface.importInterpreter();
  // Lazy-load the syntax-highlighting.
  BlocklyInterface.importPrettify();

  BlocklyGames.bindClick('helpButton', Turtle.showHelp);
  if (location.hash.length < 2 &&
      !BlocklyGames.loadFromLocalStorage(BlocklyGames.NAME,
                                         BlocklyGames.LEVEL)) {
    setTimeout(Turtle.showHelp, 1000);
    if (BlocklyGames.LEVEL == 9) {
      setTimeout(BlocklyDialogs.abortOffer, 5 * 60 * 1000);
    }
  }
  if (BlocklyGames.LEVEL == 1) {
    // Previous apps did not have categories.
    // If the user doesn't find them, point them out.
    BlocklyGames.workspace.addChangeListener(Turtle.watchCategories_);
  }
};

window.addEventListener('load', Turtle.init);

/**
 * Transform a program written in level 9 blocks into one written in the more
 * advanced level 10 blocks.
 * @param {string} xml Level 9 blocks in XML as text.
 * @return {string} Level 10 blocks in XML as text.
 */
Turtle.transform10 = function(xml) {
  var tree = Blockly.Xml.textToDom(xml);
  var node = tree;
  while (node) {
    if (node.nodeName.toLowerCase() == 'block') {
      var type = node.getAttribute('type');
      // Find the last child that's a 'field'.
      var child = node.lastChild;
      while (child && child.nodeName.toLowerCase() != 'field') {
        child = child.previousSibling;
      }
      var childName = child && child.getAttribute('name');

      if (type == 'turtle_colour_internal' && childName== 'COLOUR') {
        /*
        Old:
          <block type="turtle_colour_internal">
            <field name="COLOUR">#ffff00</field>
            <next>...</next>
          </block>
        New:
          <block type="turtle_colour">
            <value name="COLOUR">
              <shadow type="colour_picker">
                <field name="COLOUR">#ffff00</field>
              </shadow>
            </value>
            <next>...</next>
          </block>
        */
        node.setAttribute('type', 'turtle_colour');
        node.removeChild(child);
        var value = document.createElement('value');
        value.setAttribute('name', 'COLOUR');
        node.appendChild(value);
        var shadow = document.createElement('shadow');
        shadow.setAttribute('type', 'colour_picker');
        value.appendChild(shadow);
        shadow.appendChild(child);
      }

      if (type == 'turtle_repeat_internal' && childName== 'TIMES') {
        /*
        Old:
          <block type="turtle_repeat_internal">
            <field name="TIMES">3</field>
            <statement name="DO">...</statement>
            <next>...</next>
          </block>
        New:
          <block type="controls_repeat_ext">
            <value name="TIMES">
              <shadow type="math_number">
                <field name="NUM">3</field>
              </shadow>
            </value>
            <statement name="DO">...</statement>
            <next>...</next>
          </block>
        */
        node.setAttribute('type', 'controls_repeat_ext');
        node.removeChild(child);
        var value = document.createElement('value');
        value.setAttribute('name', 'TIMES');
        node.appendChild(value);
        var shadow = document.createElement('shadow');
        shadow.setAttribute('type', 'math_number');
        value.appendChild(shadow);
        child.setAttribute('name', 'NUM');
        shadow.appendChild(child);
      }

      if (type == 'turtle_move_internal' && childName== 'VALUE') {
        /*
        Old:
          <block type="turtle_move_internal">
            <field name="DIR">moveForward</field>
            <field name="VALUE">50</field>
            <next>...</next>
          </block>
        New:
          <block type="turtle_move">
            <field name="DIR">moveForward</field>
            <value name="VALUE">
              <shadow type="math_number">
                <field name="NUM">50</field>
              </shadow>
            </value>
            <next>...</next>
          </block>
        */
        node.setAttribute('type', 'turtle_move');
        node.removeChild(child);
        var value = document.createElement('value');
        value.setAttribute('name', 'VALUE');
        node.appendChild(value);
        var shadow = document.createElement('shadow');
        shadow.setAttribute('type', 'math_number');
        value.appendChild(shadow);
        child.setAttribute('name', 'NUM');
        shadow.appendChild(child);
      }

      if (type == 'turtle_turn_internal' && childName== 'VALUE') {
        /*
        Old:
          <block type="turtle_move_internal">
            <field name="DIR">turnRight</field>
            <field name="VALUE">90</field>
            <next>...</next>
          </block>
        New:
          <block type="turtle_move">
            <field name="DIR">turnRight</field>
            <value name="VALUE">
              <shadow type="math_number">
                <field name="NUM">90</field>
              </shadow>
            </value>
            <next>...</next>
          </block>
        */
        node.setAttribute('type', 'turtle_turn');
        node.removeChild(child);
        var value = document.createElement('value');
        value.setAttribute('name', 'VALUE');
        node.appendChild(value);
        var shadow = document.createElement('shadow');
        shadow.setAttribute('type', 'math_number');
        value.appendChild(shadow);
        child.setAttribute('name', 'NUM');
        shadow.appendChild(child);
      }
    }
    node = Turtle.nextNode(node);
  }
  return Blockly.Xml.domToText(tree);
};

/**
 * Walk from one node to the next in a tree.
 * @param {!Node} node Current node.
 * @return {Node} Next node, or null if ran off bottom of tree.
 */
Turtle.nextNode = function(node) {
  if (node.firstChild) {
    return node.firstChild;
  }
  do {
    if (node.nextSibling) {
      return node.nextSibling;
    }
  } while ((node = node.parentNode));
  return node;
};

/**
 * Show the help pop-up.
 */
Turtle.showHelp = function() {
  var help = document.getElementById('help');
  var button = document.getElementById('helpButton');
  var style = {
    width: '50%',
    left: '25%',
    top: '5em'
  };

  if (BlocklyGames.LEVEL == 3) {
    var xml = '<xml><block type="turtle_colour_internal" x="5" y="10">' +
        '<field name="COLOUR">#ffff00</field></block></xml>';
    BlocklyInterface.injectReadonly('sampleHelp3', xml);
  } else if (BlocklyGames.LEVEL == 4) {
    var xml = '<xml><block type="turtle_pen" x="5" y="10"></block></xml>';
    BlocklyInterface.injectReadonly('sampleHelp4', xml);
  }

  BlocklyDialogs.showDialog(help, button, true, true, style, Turtle.hideHelp);
  BlocklyDialogs.startDialogKeyDown();
};

/**
 * Hide the help pop-up.
 */
Turtle.hideHelp = function() {
  BlocklyDialogs.stopDialogKeyDown();
  if (BlocklyGames.LEVEL == 1) {
    // Previous apps did not have categories.
    // If the user doesn't find them, point them out.
    setTimeout(Turtle.showCategoryHelp, 5000);
  }
};

/**
 * Show the help pop-up to encourage clicking on the toolbox categories.
 */
Turtle.showCategoryHelp = function() {
  if (Turtle.categoryClicked_ || BlocklyDialogs.isDialogVisible_) {
    return;
  }
  var help = document.getElementById('helpToolbox');
  var style = {
    width: '25%',
    top: '3.3em'
  };
  if (BlocklyGames.isRtl()) {
    style.right = '525px';
  } else {
    style.left = '525px';
  }
  var origin = document.getElementById(':0');  // Toolbox's tree root.
  BlocklyDialogs.showDialog(help, origin, true, false, style, null);
};


/**
 * Flag indicating if a toolbox category has been clicked yet.
 * Level one only.
 * @private
 */
Turtle.categoryClicked_ = false;

/**
 * Monitor to see if the user finds the categories in level one.
 * @param {!Blockly.Events.Abstract} event Custom data for event.
 * @private
 */
Turtle.watchCategories_ = function(event) {
  if (event.type == Blockly.Events.UI && event.element == 'category') {
    Turtle.categoryClicked_ = true;
    BlocklyDialogs.hideDialog(false);
    BlocklyGames.workspace.removeChangeListener(Turtle.watchCategories_);
  }
};

/**
 * On startup draw the expected answer and save it to the answer canvas.
 */
Turtle.drawAnswer = function() {
  Turtle.reset();
  Turtle.answer();
  Turtle.ctxAnswer.globalCompositeOperation = 'copy';
  Turtle.ctxAnswer.drawImage(Turtle.ctxScratch.canvas, 0, 0);
  Turtle.ctxAnswer.globalCompositeOperation = 'source-over';
};

/**
 * Reset the turtle to the start position, clear the display, and kill any
 * pending tasks.
 */
Turtle.reset = function() {
  // Starting location and heading of the turtle.
  Turtle.x = Turtle.HEIGHT / 2;
  Turtle.y = Turtle.WIDTH / 2;
  Turtle.heading = 0;
  Turtle.penDownValue = true;
  Turtle.visible = true;

  // Clear the canvas.
  Turtle.ctxScratch.canvas.width = Turtle.ctxScratch.canvas.width;
  Turtle.ctxScratch.strokeStyle = '#ffffff';
  Turtle.ctxScratch.fillStyle = '#ffffff';
  Turtle.ctxScratch.lineWidth = 5;
  Turtle.ctxScratch.lineCap = 'round';
  Turtle.ctxScratch.font = 'normal 18pt Arial';
  Turtle.display();

  // Kill all tasks.
  for (var i = 0; i < Turtle.pidList.length; i++) {
    window.clearTimeout(Turtle.pidList[i]);
  }
  Turtle.pidList.length = 0;
  Turtle.interpreter = null;
};

/**
 * Copy the scratch canvas to the display canvas. Add a turtle marker.
 */
Turtle.display = function() {
  // Clear the display with black.
  Turtle.ctxDisplay.beginPath();
  Turtle.ctxDisplay.rect(0, 0,
      Turtle.ctxDisplay.canvas.width, Turtle.ctxDisplay.canvas.height);
  Turtle.ctxDisplay.fillStyle = '#000000';
  Turtle.ctxDisplay.fill();

  // Draw the answer layer.
  Turtle.ctxDisplay.globalCompositeOperation = 'source-over';
  Turtle.ctxDisplay.globalAlpha = 0.2;
  Turtle.ctxDisplay.drawImage(Turtle.ctxAnswer.canvas, 0, 0);
  Turtle.ctxDisplay.globalAlpha = 1;

  // Draw the user layer.
  Turtle.ctxDisplay.globalCompositeOperation = 'source-over';
  Turtle.ctxDisplay.drawImage(Turtle.ctxScratch.canvas, 0, 0);

  // Draw the turtle.
  if (Turtle.visible) {
    // Make the turtle the colour of the pen.
    Turtle.ctxDisplay.strokeStyle = Turtle.ctxScratch.strokeStyle;
    Turtle.ctxDisplay.fillStyle = Turtle.ctxScratch.fillStyle;

    // Draw the turtle body.
    var radius = Turtle.ctxScratch.lineWidth / 2 + 10;
    Turtle.ctxDisplay.beginPath();
    Turtle.ctxDisplay.arc(Turtle.x, Turtle.y, radius, 0, 2 * Math.PI, false);
    Turtle.ctxDisplay.lineWidth = 3;
    Turtle.ctxDisplay.stroke();

    // Draw the turtle head.
    var WIDTH = 0.3;
    var HEAD_TIP = 10;
    var ARROW_TIP = 4;
    var BEND = 6;
    var radians = Blockly.utils.math.toRadians(Turtle.heading);
    var tipX = Turtle.x + (radius + HEAD_TIP) * Math.sin(radians);
    var tipY = Turtle.y - (radius + HEAD_TIP) * Math.cos(radians);
    radians -= WIDTH;
    var leftX = Turtle.x + (radius + ARROW_TIP) * Math.sin(radians);
    var leftY = Turtle.y - (radius + ARROW_TIP) * Math.cos(radians);
    radians += WIDTH / 2;
    var leftControlX = Turtle.x + (radius + BEND) * Math.sin(radians);
    var leftControlY = Turtle.y - (radius + BEND) * Math.cos(radians);
    radians += WIDTH;
    var rightControlX = Turtle.x + (radius + BEND) * Math.sin(radians);
    var rightControlY = Turtle.y - (radius + BEND) * Math.cos(radians);
    radians += WIDTH / 2;
    var rightX = Turtle.x + (radius + ARROW_TIP) * Math.sin(radians);
    var rightY = Turtle.y - (radius + ARROW_TIP) * Math.cos(radians);
    Turtle.ctxDisplay.beginPath();
    Turtle.ctxDisplay.moveTo(tipX, tipY);
    Turtle.ctxDisplay.lineTo(leftX, leftY);
    Turtle.ctxDisplay.bezierCurveTo(leftControlX, leftControlY,
        rightControlX, rightControlY, rightX, rightY);
    Turtle.ctxDisplay.closePath();
    Turtle.ctxDisplay.fill();
  }
};

/**
 * Click the run button.  Start the program.
 * @param {!Event} e Mouse or touch event.
 */
Turtle.runButtonClick = function(e) {
  // Prevent double-clicks or double-taps.
  if (BlocklyInterface.eventSpam(e)) {
    return;
  }
  var runButton = document.getElementById('runButton');
  var resetButton = document.getElementById('resetButton');
  // Ensure that Reset button is at least as wide as Run button.
  if (!resetButton.style.minWidth) {
    resetButton.style.minWidth = runButton.offsetWidth + 'px';
  }
  runButton.style.display = 'none';
  resetButton.style.display = 'inline';
  document.getElementById('spinner').style.visibility = 'visible';
  Turtle.execute();
};

/**
 * Click the reset button.  Reset the Turtle.
 * @param {!Event} e Mouse or touch event.
 */
Turtle.resetButtonClick = function(e) {
  // Prevent double-clicks or double-taps.
  if (BlocklyInterface.eventSpam(e)) {
    return;
  }
  var runButton = document.getElementById('runButton');
  runButton.style.display = 'inline';
  document.getElementById('resetButton').style.display = 'none';
  document.getElementById('spinner').style.visibility = 'hidden';
  BlocklyGames.workspace.highlightBlock(null);
  Turtle.reset();

  // Image cleared; prevent user from submitting to gallery.
  Turtle.canSubmit = false;
};

/**
 * Inject the Turtle API into a JavaScript interpreter.
 * @param {!Interpreter} interpreter The JS Interpreter.
 * @param {!Interpreter.Object} scope Global scope.
 */
Turtle.initInterpreter = function(interpreter, scope) {
  // API
  var wrapper;
  wrapper = function(distance, id) {
    Turtle.move(distance, id);
  };
  interpreter.setProperty(scope, 'moveForward',
      interpreter.createNativeFunction(wrapper));
  wrapper = function(distance, id) {
    Turtle.move(-distance, id);
  };
  interpreter.setProperty(scope, 'moveBackward',
      interpreter.createNativeFunction(wrapper));

  wrapper = function(angle, id) {
    Turtle.turn(angle, id);
  };
  interpreter.setProperty(scope, 'turnRight',
      interpreter.createNativeFunction(wrapper));
  wrapper = function(angle, id) {
    Turtle.turn(-angle, id);
  };
  interpreter.setProperty(scope, 'turnLeft',
      interpreter.createNativeFunction(wrapper));

  wrapper = function(id) {
    Turtle.penDown(false, id);
  };
  interpreter.setProperty(scope, 'penUp',
      interpreter.createNativeFunction(wrapper));
  wrapper = function(id) {
    Turtle.penDown(true, id);
  };
  interpreter.setProperty(scope, 'penDown',
      interpreter.createNativeFunction(wrapper));

  wrapper = function(width, id) {
    Turtle.penWidth(width, id);
  };
  interpreter.setProperty(scope, 'penWidth',
      interpreter.createNativeFunction(wrapper));

  wrapper = function(colour, id) {
    Turtle.penColour(colour, id);
  };
  interpreter.setProperty(scope, 'penColour',
      interpreter.createNativeFunction(wrapper));

  wrapper = function(id) {
    Turtle.isVisible(false, id);
  };
  interpreter.setProperty(scope, 'hideTurtle',
      interpreter.createNativeFunction(wrapper));
  wrapper = function(id) {
    Turtle.isVisible(true, id);
  };
  interpreter.setProperty(scope, 'showTurtle',
      interpreter.createNativeFunction(wrapper));

  wrapper = function(text, id) {
    Turtle.drawPrint(text, id);
  };
  interpreter.setProperty(scope, 'print',
      interpreter.createNativeFunction(wrapper));

  wrapper = function(font, size, style, id) {
    Turtle.drawFont(font, size, style, id);
  };
  interpreter.setProperty(scope, 'font',
      interpreter.createNativeFunction(wrapper));
};

/**
 * Execute the user's code.  Heaven help us...
 */
Turtle.execute = function() {
  if (!('Interpreter' in window)) {
    // Interpreter lazy loads and hasn't arrived yet.  Try again later.
    setTimeout(Turtle.execute, 250);
    return;
  }

  Turtle.reset();
  Blockly.selected && Blockly.selected.unselect();
  var code = Blockly.JavaScript.workspaceToCode(BlocklyGames.workspace);
  Turtle.interpreter = new Interpreter(code, Turtle.initInterpreter);
  Turtle.pidList.push(setTimeout(Turtle.executeChunk_, 100));
};

/**
 * Execute a bite-sized chunk of the user's code.
 * @private
 */
Turtle.executeChunk_ = function() {
  // All tasks should be complete now.  Clean up the PID list.
  Turtle.pidList.length = 0;
  Turtle.pause = 0;
  var go;
  do {
    try {
      go = Turtle.interpreter.step();
    } catch (e) {
      // User error, terminate in shame.
      alert(e);
      go = false;
    }
    if (go && Turtle.pause) {
      // The last executed command requested a pause.
      go = false;
      Turtle.pidList.push(
          setTimeout(Turtle.executeChunk_, Turtle.pause));
    }
  } while (go);
  // Wrap up if complete.
  if (!Turtle.pause) {
    document.getElementById('spinner').style.visibility = 'hidden';
    BlocklyGames.workspace.highlightBlock(null);
    Turtle.checkAnswer();
    // Image complete; allow the user to submit this image to gallery.
    Turtle.canSubmit = true;
  }
};

/**
 * Highlight a block and pause.
 * @param {string|undefined} id ID of block.
 */
Turtle.animate = function(id) {
  // No need for a full render if there's no block ID,
  // since that's the signature of just pre-drawing the answer layer.
  if (id) {
    Turtle.display();
    BlocklyInterface.highlight(id);
    // Scale the speed non-linearly, to give better precision at the fast end.
    var stepSpeed = 1000 * Math.pow(1 - Turtle.speedSlider.getValue(), 2);
    Turtle.pause = Math.max(1, stepSpeed);
  }
};

/**
 * Move the turtle forward or backward.
 * @param {number} distance Pixels to move.
 * @param {string=} opt_id ID of block.
 */
Turtle.move = function(distance, opt_id) {
  if (Turtle.penDownValue) {
    Turtle.ctxScratch.beginPath();
    Turtle.ctxScratch.moveTo(Turtle.x, Turtle.y);
  }
  if (distance) {
    var radians = Blockly.utils.math.toRadians(Turtle.heading);
    Turtle.x += distance * Math.sin(radians);
    Turtle.y -= distance * Math.cos(radians);
    var bump = 0;
  } else {
    // WebKit (unlike Gecko) draws nothing for a zero-length line.
    var bump = 0.1;
  }
  if (Turtle.penDownValue) {
    Turtle.ctxScratch.lineTo(Turtle.x, Turtle.y + bump);
    Turtle.ctxScratch.stroke();
  }
  Turtle.animate(opt_id);
};

/**
 * Turn the turtle left or right.
 * @param {number} angle Degrees to turn clockwise.
 * @param {string=} opt_id ID of block.
 */
Turtle.turn = function(angle, opt_id) {
  Turtle.heading = BlocklyGames.normalizeAngle(Turtle.heading + angle);
  Turtle.animate(opt_id);
};

/**
 * Lift or lower the pen.
 * @param {boolean} down True if down, false if up.
 * @param {string=} opt_id ID of block.
 */
Turtle.penDown = function(down, opt_id) {
  Turtle.penDownValue = down;
  Turtle.animate(opt_id);
};

/**
 * Change the thickness of lines.
 * @param {number} width New thickness in pixels.
 * @param {string=} opt_id ID of block.
 */
Turtle.penWidth = function(width, opt_id) {
  Turtle.ctxScratch.lineWidth = width;
  Turtle.animate(opt_id);
};

/**
 * Change the colour of the pen.
 * @param {string} colour Hexadecimal #rrggbb colour string.
 * @param {string=} opt_id ID of block.
 */
Turtle.penColour = function(colour, opt_id) {
  Turtle.ctxScratch.strokeStyle = colour;
  Turtle.ctxScratch.fillStyle = colour;
  Turtle.animate(opt_id);
};

/**
 * Make the turtle visible or invisible.
 * @param {boolean} visible True if visible, false if invisible.
 * @param {string=} opt_id ID of block.
 */
Turtle.isVisible = function(visible, opt_id) {
  Turtle.visible = visible;
  Turtle.animate(opt_id);
};

/**
 * Print some text.
 * @param {string} text Text to print.
 * @param {string=} opt_id ID of block.
 */
Turtle.drawPrint = function(text, opt_id) {
  Turtle.ctxScratch.save();
  Turtle.ctxScratch.translate(Turtle.x, Turtle.y);
  Turtle.ctxScratch.rotate(Blockly.utils.math.toRadians(Turtle.heading - 90));
  Turtle.ctxScratch.fillText(text, 0, 0);
  Turtle.ctxScratch.restore();
  Turtle.animate(opt_id);
};

/**
 * Change the typeface of printed text.
 * @param {string} font Font name (e.g. 'Arial').
 * @param {number} size Font size (e.g. 18).
 * @param {string} style Font style (e.g. 'italic').
 * @param {string=} opt_id ID of block.
 */
Turtle.drawFont = function(font, size, style, opt_id) {
  Turtle.ctxScratch.font = style + ' ' + size + 'pt ' + font;
  Turtle.animate(opt_id);
};

/**
 * Verify if the answer is correct.
 * If so, move on to next level.
 */
Turtle.checkAnswer = function() {
  // Compare the Alpha (opacity) byte of each pixel in the user's image and
  // the sample answer image.
  var userImage =
      Turtle.ctxScratch.getImageData(0, 0, Turtle.WIDTH, Turtle.HEIGHT);
  var answerImage =
      Turtle.ctxAnswer.getImageData(0, 0, Turtle.WIDTH, Turtle.HEIGHT);
  var len = Math.min(userImage.data.length, answerImage.data.length);
  var delta = 0;
  // Pixels are in RGBA format.  Only check the Alpha bytes.
  for (var i = 3; i < len; i += 4) {
    // Check the Alpha byte.
    if (Math.abs(userImage.data[i] - answerImage.data[i]) > 64) {
      delta++;
    }
  }
  if (Turtle.isCorrect(delta)) {
    BlocklyInterface.saveToLocalStorage();
    if (BlocklyGames.LEVEL < BlocklyGames.MAX_LEVEL) {
      // No congrats for last level, it is open ended.
      BlocklyGames.workspace.getAudioManager().play('win', 0.5);
      BlocklyDialogs.congratulations();
    }
  } else {
    Turtle.penColour('#ff0000');
  }
};

/**
 * Send an image of the canvas to gallery.
 */
Turtle.submitToGallery = function() {
  if (!Turtle.canSubmit) {
    alert(BlocklyGames.getMsg('Turtle_submitDisabled'));
    return;
  }
  // Encode the thumbnail.
  var thumbnail = document.getElementById('thumbnail');
  var ctxThumb = thumbnail.getContext('2d');
  ctxThumb.globalCompositeOperation = 'copy';
  ctxThumb.drawImage(Turtle.ctxDisplay.canvas, 0, 0, 200, 200);
  var thumbData = thumbnail.toDataURL('image/png');
  document.getElementById('galleryThumb').value = thumbData;

  // Show the dialog.
  BlocklyGallery.showGalleryForm();
};
