import Quill from "quill";
// import "quill/dist/quill.core.css";

export default {
  mounted() {
    this.initializeState();
    this.setupQuillEditor();
    this.setupEventHandlers();
    this.setupAutoSave();
  },

  destroyed() {
    this.cleanup();
  },

  // Initialize component state
  initializeState() {
    this.editor = null;
    this.autoSaveInterval = null;
    this.autoSaveEnabled = false;
    this.isDestroyed = false;
    this.saveButton = null;
    this.autoSaveToggle = null;
    this.autoSaveStatus = null;
    this.inputElement = null;
  },

  // Setup Quill editor
  setupQuillEditor() {
    const editorElement = this.el.querySelector("#quill-editor");
    this.inputElement = this.el.querySelector("#quill-input");

    if (!editorElement || !this.inputElement) {
      console.error("Quill editor or input element not found");
      return;
    }

    // Configure Quill with custom toolbar
    const toolbarOptions = [
      [{ header: [1, 2, 3, 4, 5, 6, false] }],
      [{ font: [] }],
      [{ size: ["small", false, "large", "huge"] }],
      ["bold", "italic", "underline", "strike"],
      [{ color: [] }, { background: [] }],
      [{ script: "sub" }, { script: "super" }],
      [{ list: "ordered" }, { list: "bullet" }],
      [{ indent: "-1" }, { indent: "+1" }],
      [{ direction: "rtl" }],
      [{ align: [] }],
      ["blockquote", "code-block"],
      ["link", "image", "video"],
      ["clean"],
    ];

    // Initialize Quill editor
    this.editor = new Quill(editorElement, {
      theme: "snow",
      modules: {
        toolbar: {
          container: toolbarOptions,
          handlers: {
            image: this.handleImageUpload.bind(this),
          },
        },
      },
      placeholder: "Start writing your content here...",
      readOnly: false,
    });

    // Set initial content if available
    const initialContent = this.inputElement.value;
    if (initialContent) {
      try {
        const delta = JSON.parse(initialContent);
        this.editor.setContents(delta);
      } catch (error) {
        // If not valid JSON, treat as HTML
        this.editor.root.innerHTML = initialContent;
      }
    }

    console.log("Quill editor initialized");
  },

  // Setup event handlers
  setupEventHandlers() {
    // Quill editor events
    this.editor.on("text-change", this.handleContentChange.bind(this));
    this.editor.on("selection-change", this.handleSelectionChange.bind(this));

    // Get UI elements
    this.saveButton = document.querySelector("#save-btn");
    this.autoSaveToggle = document.querySelector("#auto-save-toggle");
    this.autoSaveStatus = document.querySelector("#auto-save-status");

    // Setup button handlers
    if (this.autoSaveToggle) {
      this.autoSaveToggle.addEventListener(
        "click",
        this.toggleAutoSave.bind(this),
      );
    }

    if (this.saveButton) {
      this.saveButton.addEventListener(
        "click",
        this.handleSaveClick.bind(this),
      );
    }

    // LiveView event handlers
    this.handleEvent("content_saved", this.handleContentSaved.bind(this));
    this.handleEvent("save_error", this.handleSaveError.bind(this));
  },

  // Handle content changes
  handleContentChange(delta, oldDelta, source) {
    if (this.isDestroyed || source !== "user") return;

    // Get content as Delta (structured format)
    const content = JSON.stringify(this.editor.getContents());
    this.inputElement.value = content;

    console.log(content);

    // Send content change to LiveView
    this.pushEvent("content_changed", { content: content });

    // Enable save button
    this.enableSaveButton();
  },

  // Handle selection changes
  handleSelectionChange(range, oldRange, source) {
    if (range) {
      if (range.length === 0) {
        console.log("User cursor is on", range.index);
      } else {
        console.log("User has highlighted", range.index, range.length);
      }
    } else {
      console.log("Cursor not in the editor");
    }
  },

  // Handle image upload
  handleImageUpload() {
    // Create a hidden file input
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", "image/*");
    input.click();

    input.onchange = async () => {
      const file = input.files[0];
      if (file) {
        try {
          const result = await this.uploadImageFile(file);

          // Insert image at current cursor position
          const range = this.editor.getSelection(true);
          this.editor.insertEmbed(range.index, "image", result.url);

          // Move cursor after the image
          this.editor.setSelection(range.index + 1);
        } catch (error) {
          console.error("Image upload failed:", error);
          this.showErrorMessage("Failed to upload image");
        }
      }
    };
  },

  // Upload image file
  async uploadImageFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    const csrfToken = document
      .querySelector('meta[name="csrf-token"]')
      ?.getAttribute("content");

    const response = await fetch("/api/upload-image", {
      method: "POST",
      body: formData,
      headers: {
        "X-CSRF-Token": csrfToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status: ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      return result.file;
    } else {
      throw new Error(result.error || "Upload failed");
    }
  },

  // Handle save button click
  handleSaveClick() {
    const content = JSON.stringify(this.editor.getContents());
    this.pushEvent("save_content", { content: content });
  },

  // Setup auto-save functionality
  setupAutoSave() {
    // Auto-save is initially disabled
    this.updateAutoSaveStatus();
  },

  // Toggle auto-save
  toggleAutoSave() {
    this.autoSaveEnabled = !this.autoSaveEnabled;

    if (this.autoSaveEnabled) {
      this.startAutoSave();
    } else {
      this.stopAutoSave();
    }

    this.updateAutoSaveStatus();
  },

  // Start auto-save
  startAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    this.autoSaveInterval = setInterval(() => {
      this.performAutoSave();
    }, 10000); // Auto-save every 10 seconds
  },

  // Stop auto-save
  stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  },

  // Perform auto-save
  performAutoSave() {
    if (!this.editor || this.isDestroyed) return;

    const content = JSON.stringify(this.editor.getContents());
    const text = this.editor.getText();

    if (text.trim() !== "") {
      this.pushEvent("auto_save", { content: content });
      console.log("Auto-saved content");
    }
  },

  // Update auto-save status display
  updateAutoSaveStatus() {
    if (this.autoSaveStatus) {
      this.autoSaveStatus.textContent = this.autoSaveEnabled ? "ON" : "OFF";
    }
  },

  // Enable save button
  enableSaveButton() {
    if (this.saveButton) {
      this.saveButton.disabled = false;
      this.saveButton.classList.remove("opacity-50");
    }
  },

  // Disable save button
  disableSaveButton() {
    if (this.saveButton) {
      this.saveButton.disabled = true;
      this.saveButton.classList.add("opacity-50");
    }
  },

  // Handle successful save
  handleContentSaved() {
    console.log("Content saved successfully");
    this.disableSaveButton();
    this.showSuccessMessage("Content saved successfully!");
  },

  // Handle save error
  handleSaveError(error) {
    console.error("Save error:", error);
    this.showErrorMessage("Failed to save content");
  },

  // Show success message
  showSuccessMessage(message) {
    this.pushEvent("show_flash", { type: "success", message: message });
  },

  // Show error message
  showErrorMessage(message) {
    this.pushEvent("show_flash", { type: "error", message: message });
  },

  // Get current content
  getCurrentContent() {
    return this.editor ? JSON.stringify(this.editor.getContents()) : "";
  },

  // Get current text
  getCurrentText() {
    return this.editor ? this.editor.getText() : "";
  },

  // Set content programmatically
  setContent(content) {
    if (this.editor) {
      try {
        const delta = JSON.parse(content);
        this.editor.setContents(delta);
      } catch (error) {
        // If not valid JSON, treat as HTML
        this.editor.root.innerHTML = content;
      }
    }
  },

  // Clear content
  clearContent() {
    if (this.editor) {
      this.editor.setText("");
    }
  },

  // Insert text at cursor
  insertText(text) {
    if (this.editor) {
      const range = this.editor.getSelection(true);
      this.editor.insertText(range.index, text);
    }
  },

  // Format text
  formatText(format, value) {
    if (this.editor) {
      const range = this.editor.getSelection(true);
      if (range) {
        this.editor.formatText(range.index, range.length, format, value);
      }
    }
  },

  // Cleanup
  cleanup() {
    this.isDestroyed = true;

    // Stop auto-save
    this.stopAutoSave();

    // Clear references
    this.editor = null;
    this.inputElement = null;
    this.saveButton = null;
    this.autoSaveToggle = null;
    this.autoSaveStatus = null;
  },
};
