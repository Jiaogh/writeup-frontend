import React, { Fragment } from "react";
import { MainStyles } from "components/MainComponent/Main.styles";
import withStyles from "@material-ui/core/styles/withStyles";
import { withRouter } from "react-router-dom";
import Paper from "@material-ui/core/Paper/Paper";
import Typography from "@material-ui/core/Typography/Typography";
import { TopbarComponent } from "components/TopbarComponent/Topbar";
import { Editor } from "slate-react";
import { PromptSelectComponent } from "components/MainComponent/PromptSelectComponent";
import { ReactWebSocket } from "components/ReactWebSocket";
import { serializeAPIMessageToPrompts } from "utilities/apiSerializers";
import {
  DividerSection,
  GridLayout,
  HowToSelectPromptSection,
  initialValue,
  MainFooter,
  SPECIAL_CHARACTERS,
  WritingHeader
} from "components/MainComponent/utilities";

import moment from "moment";
import { LinearIndeterminate } from "components/Loading";
import { SettingsModal } from "components/SettingsModalComponent/SettingsModal";
import { WebSocketURL } from "components/MainComponent/constants";

export class _MainComponent extends React.Component {
  constructor(props) {
    super(props);

    // editor reference to insert text outside of the editor direct control
    this.textEditorRef = React.createRef();

    const textPrompts = [];

    this.state = {
      editorValue: initialValue,
      currentDetailIndex: null,
      textPrompts: textPrompts,

      // with each spacebar key, unsent set to true
      unsent: false,

      // create a false lastSent to ensure first send is easy
      lastSent: moment().subtract(5, "seconds"),
      temperature: 0.7,
      top_k: 10,
      length: 40,
      batch_size: 4
    };
  }

  componentDidMount() {
    this.websocket = new ReactWebSocket({
      url: WebSocketURL,
      debug: true,
      reconnect: true,
      onMessage: this.handleWebSocketData,
      onOpen: this.webSocketConnected
    });

    this.websocket.setupWebSocket();

    // puts cursor at end for easier resuming
    this.textEditorRef.current.moveToEndOfDocument();
    this.intervalID = setInterval(this.checkToSend, 1500);
  }

  componentWillUnmount() {
    this.websocket.dissembleWebSocket();
    clearInterval(this.intervalID);
  }

  ////////////////////
  // timing utilities
  ////////////////////
  enoughTimeSinceLastSend = () => {
    //fast typists shouldn't send multiple API calls to the server,
    //especially if they know what they're about to write
    const delayLimit = moment().subtract(1, "seconds");

    // return true only if we've waited enough time to not hammer
    // the servers
    return this.state.lastSent < delayLimit;
  };

  checkToSend = () => {
    // i sort of worry I'm writing a huge ddos attack on myself to
    // slightly improve UX slightly ...

    const editorAtEndOfText = this.checkEditorPositionAtEnd();
    const userForgotToHitSpace =
      editorAtEndOfText && this.state.textPrompts.length === 0;

    if (this.state.unsent || userForgotToHitSpace) {
      const canSend = this.enoughTimeSinceLastSend();
      if (canSend) {
        this.sendTextToWebSocket();
      }
    }
  };

  ////////////////////
  // websocket handles
  ////////////////////
  handleWebSocketData = data => {
    const messageSerialized = JSON.parse(data);
    const message = messageSerialized["message"];

    const textPrompts = serializeAPIMessageToPrompts({ message });
    const text = this.state.editorValue.document.text;

    // This will only show texts that were meant for the prompt ...
    // this happens if the user types very quickly and it fires off a lot
    // of API requests, then we keep on receiving additional messages
    // from previous words
    if (message.prompt.trim().slice(-10) === text.trim().slice(-10)) {
      this.setState({
        textPrompts: textPrompts
      });
    }
  };

  webSocketConnected = () => {
    this.sendTextToWebSocket();
  };

  sendTextToWebSocket = () => {
    if (!this.websocket.initialized) {
      return;
    }

    this.setState({
      unsent: false,
      lastSent: moment(),
      textPrompts: []
    });

    // gets a concatenated list of all the text so far
    // but only get the last 1500 characters, otherwise, we run out of
    // memory on gpu instances
    const text = this.state.editorValue.document.text.slice(-1500);

    const textIsBlank = text.trim().length === 0;
    if (textIsBlank) {
      return;
    }

    const message = {
      prompt: text,
      temperature: this.state.temperature,
      top_k: this.state.top_k,
      length: this.state.length,
      batch_size: this.state.batch_size
    };

    console.log("Sending| " + text);
    const messageSerialized = JSON.stringify(message);

    this.websocket.sendMessage(messageSerialized);
  };

  ////////////////////
  // text editor utilities
  ////////////////////
  onTextChange = ({ value }) => {
    this.setState({ editorValue: value });
  };

  checkEditorPositionAtEnd = () => {
    // pretty sure it shouldn't this hard to check positions, but i haven't
    // groked all of slatejs documentation because i'm focusing on optimizing
    // on the backend
    const currentOffset = this.textEditorRef.current.value.selection.focus
      .offset;
    const endTextLength = this.textEditorRef.current.value.endText.text.length;

    /*
    justification of this function ...

    if slatejs's offset is at the same position as the ending text length
    means the user typed a word and forgot spacebar. since using spacebar
    is an odd way to "fire" an api, sometimes users (aka myself) forget to hit
    spacebar. it's a crappy UX feeling when you forget to hit spacebar, so throw
    a hack to check if the user (yourself) made this error

    i didn't just fire the API regardless at any cursor position, because
    there's one killer feature that i wanted to add (ssssh. it's a secret for
    now). thanks for reading this far tho!
    */
    return currentOffset === endTextLength;
  };

  moveUp = () => {
    const maxIndex = this.state.textPrompts.length - 1;

    // first move, nothing selected
    if (this.state.currentDetailIndex === null) {
      this.setState({ currentDetailIndex: 0 });
    } else if (this.state.currentDetailIndex > 0) {
      this.setState({ currentDetailIndex: this.state.currentDetailIndex - 1 });
    } else if (this.state.currentDetailIndex === 0) {
      this.setState({ currentDetailIndex: maxIndex });
    }
  };

  moveDown = () => {
    const maxIndex = this.state.textPrompts.length - 1;

    if (this.state.currentDetailIndex === null) {
      this.setState({ currentDetailIndex: maxIndex });
    } else if (this.state.currentDetailIndex < maxIndex) {
      this.setState({ currentDetailIndex: this.state.currentDetailIndex + 1 });
    } else if (this.state.currentDetailIndex === maxIndex) {
      this.setState({ currentDetailIndex: 0 });
    }
  };

  onSpacebarPressed = () => {
    // everytime a spacebar is hit, it's the end of a word
    // set unsent true, but if the writer is typing really quickly
    // then ensure that they can only send one api call a second
    // otherwise, his/her own api calls will trip
    this.setState({ unsent: true, textPrompts: [] });

    const canSend = this.enoughTimeSinceLastSend();

    if (canSend) {
      this.sendTextToWebSocket();
    }
  };

  onKeyPressed = e => {
    const upKey = 38;
    const downKey = 40;
    const escapeKey = 27;
    const spaceKey = 32;

    if (e.keyCode === upKey) {
      this.moveUp();
      e.preventDefault();
    } else if (e.keyCode === downKey) {
      this.moveDown();
      e.preventDefault();
    } else if (e.keyCode === escapeKey) {
      this.focusTextInput();
    } else if (e.keyCode === spaceKey) {
      // TODO - consider maybe including periods other end of sentences?
      this.onSpacebarPressed();
    }

    // shift every key action back to the text box, this lets
    // user select prompt or disregard halfway and continue writing
    this.focusTextInput();
  };

  clearSelectedPrompt = () => {
    // haven't figured out how to deal with async correctly to set the state to
    // null
    this.setState({ currentDetailIndex: null });
  };

  insertEditorText = ({ text }) => {
    // This is an ugly hack to hide my JS incompetence
    let self = this;
    return new Promise(function(resolve, reject) {
      // Do a bit of logic here to contain if text character ending
      // has a space or doesn't ... and if the chosen text contains
      // an end of text prompt
      const editor = self.textEditorRef.current;

      const typedText = self.state.editorValue.document.text;
      const lastCharacterText = typedText.slice(-1);
      const lastCharacterIsSpace = lastCharacterText === " ";

      // if the text input starts with a . or something denoting
      // an end of a phrase, remove a space to add the .
      const firstCharacterOfText = text[0];
      const firstCharacterOfTextIsSpecial = SPECIAL_CHARACTERS.includes(
        firstCharacterOfText
      );

      if (lastCharacterIsSpace && firstCharacterOfTextIsSpecial) {
        editor.moveAnchorBackward(1).insertText(text);
      } else {
        editor.insertText(text);
      }

      //self.textEditorRef.current.insertText(text);
      resolve("Success!");
    });
  };

  // used as helper utilities for list items to easily add text to editor
  onTextClick = prompt => props => {
    // when selecting a new text, empty out the previous prompts
    let waitForEditorTextInsert = this.insertEditorText({ text: prompt });

    waitForEditorTextInsert.then(response => {
      this.sendTextToWebSocket();
    });

    this.focusTextInput();

    // after something has been selected, no items should be selected
    //this.clearSelectedPrompt()
  };

  focusTextInput = () => {
    // Explicitly focus the text input using the raw DOM API
    // Note: we're accessing "current" to get the DOM node
    this.textEditorRef.current.focus();
  };

  //////
  // settings helpers
  //////
  setSettings = setting => value => {
    this.setState({ [setting]: value });
  };

  applySettings = () => {
    // This whole function is to make the user feel powerful
    // it force a websocket call with the updated parameters
    this.sendTextToWebSocket();
    this.setModal();
  };

  setModal = () => {
    this.setState({ modalOpen: !this.state.modalOpen });
  };

  renderModal = () => {
    if (!this.state.modalOpen) {
      return null;
    }

    return (
      <SettingsModal
        modalOpen={this.state.modalOpen}
        setModal={this.setModal}
        settings={this.state}
        setSettings={this.setSettings}
        applySettings={this.applySettings}
      />
    );
  };

  render() {
    const { classes } = this.props;

    return (
      <Fragment>
        <TopbarComponent setModal={this.setModal} />
        {this.renderModal()}

        <div className={classes.root} onKeyDown={this.onKeyPressed}>
          <GridLayout classes={classes}>
            <Paper className={classes.paper}>
              <div className={classes.box}>
                {WritingHeader}
                <Typography
                  variant="subtitle1"
                  gutterBottom
                  color={"textPrimary"}
                >
                  <Editor
                    value={this.state.editorValue}
                    onChange={this.onTextChange}
                    autoFocus={true}
                    ref={this.textEditorRef}
                  />
                  {DividerSection}
                </Typography>
                {this.state.textPrompts.length > 0 ? (
                  <Fragment>
                    {HowToSelectPromptSection}
                    <PromptSelectComponent
                      selectedIndex={this.state.currentDetailIndex}
                      onTextClick={this.onTextClick}
                      textPrompts={this.state.textPrompts}
                    />
                  </Fragment>
                ) : (
                  <LinearIndeterminate />
                )}
              </div>
              {/*<LearnMoreButton classes={classes} />*/}
            </Paper>
            <br />
            <MainFooter classes={classes} />
          </GridLayout>
        </div>
      </Fragment>
    );
  }
}

export const MainComponent = withRouter(withStyles(MainStyles)(_MainComponent));
