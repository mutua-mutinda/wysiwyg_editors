import Quill from "quill";

/**
 * LiveView hook for Quill rich text editor integration
 * Provides auto-save, image upload, and real-time content synchronization
 */
export default {
  mounted() {
    this.initialize();
  },

  destroyed() {
    this.cleanup();
  },

  /**
   * Initialize the component
   */
  initialize() {
    this.initializeState();
    this.cacheElements();
    this.setupQuillEditor();
    this.bindEventHandlers();
    this.setupAutoSave();
  },

  /**
   * Initialize component state
   */
  initializeState() {
    this.state = {
      editor: null,
      autoSaveInterval: null,
      autoSaveEnabled: false,
      isDestroyed: false,
      lastSavedContent: null,
    };

    this.config = {
      autoSaveInterval: 10000, // 10 seconds
      imageUploadEndpoint: "/api/upload-image",
    };
  },

  /**
   * Cache DOM elements for better performance
   */
  cacheElements() {
    this.elements = {
      editor: this.el.querySelector("#quill-editor"),
      input: this.el.querySelector("#quill-input"),
      saveButton: document.querySelector("#save-btn"),
      autoSaveToggle: document.querySelector("#auto-save-toggle"),
      autoSaveStatus: document.querySelector("#auto-save-status"),
    };

    // Validate required elements
    if (!this.elements.editor || !this.elements.input) {
      throw new Error("Required Quill editor elements not found");
    }
  },

  /**
   * Setup Quill editor with configuration
   */
  setupQuillEditor() {
    const toolbarConfig = this.getToolbarConfiguration();

    this.state.editor = new Quill(this.elements.editor, {
      theme: "snow",
      modules: {
        toolbar: {
          container: toolbarConfig,
          handlers: {
            image: this.handleImageUpload.bind(this),
          },
        },
      },
      placeholder: "Start writing your content here...",
      readOnly: false,
    });

    this.loadInitialContent();
    console.log("Quill editor initialized successfully");
  },

  /**
   * Get toolbar configuration
   */
  getToolbarConfiguration() {
    return [
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
  },

  /**
   * Load initial content into editor
   */
  loadInitialContent() {
    const initialContent = this.elements.input.value;
    if (!initialContent) return;

    try {
      const delta = JSON.parse(initialContent);
      this.state.editor.setContents(delta);
      this.state.lastSavedContent = initialContent;
    } catch (error) {
      // Fallback to HTML if JSON parsing fails
      this.state.editor.root.innerHTML = initialContent;
      console.warn("Initial content was not valid JSON, treated as HTML");
    }
  },

  /**
   * Bind all event handlers
   */
  bindEventHandlers() {
    this.bindQuillEvents();
    this.bindUIEvents();
    this.bindLiveViewEvents();
  },

  /**
   * Bind Quill editor events
   */
  bindQuillEvents() {
    this.state.editor.on("text-change", this.handleContentChange.bind(this));
    this.state.editor.on(
      "selection-change",
      this.handleSelectionChange.bind(this),
    );
  },

  /**
   * Bind UI element events
   */
  bindUIEvents() {
    if (this.elements.autoSaveToggle) {
      this.elements.autoSaveToggle.addEventListener(
        "click",
        this.toggleAutoSave.bind(this),
      );
    }

    if (this.elements.saveButton) {
      this.elements.saveButton.addEventListener(
        "click",
        this.handleSaveClick.bind(this),
      );
    }
  },

  /**
   * Bind LiveView events
   */
  bindLiveViewEvents() {
    this.handleEvent("content_saved", this.handleContentSaved.bind(this));
    this.handleEvent("save_error", this.handleSaveError.bind(this));
  },

  /**
   * Handle content changes in editor
   */
  handleContentChange(delta, oldDelta, source) {
    if (this.state.isDestroyed || source !== "user") return;

    const content = this.serializeContent();
    this.elements.input.value = content;

    // Only push event if content actually changed
    if (content !== this.state.lastSavedContent) {
      this.pushEvent("content_changed", { content });
      this.updateSaveButtonState(true);
    }
  },

  /**
   * Handle selection changes (optional logging)
   */
  handleSelectionChange(range, oldRange, source) {
    if (!range) return;

    if (range.length === 0) {
      console.log(`Cursor position: ${range.index}`);
    } else {
      console.log(`Selection: ${range.index} - ${range.index + range.length}`);
    }
  },

  /**
   * Handle image upload
   */
  async handleImageUpload() {
    try {
      const file = await this.selectImageFile();
      if (!file) return;

      const uploadResult = await this.uploadImageFile(file);
      this.insertImageIntoEditor(uploadResult.url);
    } catch (error) {
      console.error("Image upload failed:", error);
      this.showMessage("error", "Failed to upload image");
    }
  },

  /**
   * Show file selection dialog
   */
  selectImageFile() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";

      input.onchange = () => resolve(input.files[0]);
      input.oncancel = () => resolve(null);

      input.click();
    });
  },

  /**
   * Upload image file to server
   */
  async uploadImageFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    const csrfToken = document
      .querySelector('meta[name="csrf-token"]')
      ?.getAttribute("content");

    const response = await fetch(this.config.imageUploadEndpoint, {
      method: "POST",
      body: formData,
      headers: {
        "X-CSRF-Token": csrfToken,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Upload failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Upload failed");
    }

    return result.file;
  },

  /**
   * Insert image into editor at current cursor position
   */
  insertImageIntoEditor(imageUrl) {
    const range = this.state.editor.getSelection(true);
    this.state.editor.insertEmbed(range.index, "image", imageUrl);
    this.state.editor.setSelection(range.index + 1);
  },

  /**
   * Handle manual save button click
   */
  handleSaveClick() {
    const content = this.serializeContent();
    this.pushEvent("save_content", { content });
  },

  /**
   * Setup auto-save functionality
   */
  setupAutoSave() {
    this.updateAutoSaveStatus();
  },

  /**
   * Toggle auto-save on/off
   */
  toggleAutoSave() {
    this.state.autoSaveEnabled = !this.state.autoSaveEnabled;

    if (this.state.autoSaveEnabled) {
      this.startAutoSave();
    } else {
      this.stopAutoSave();
    }

    this.updateAutoSaveStatus();
  },

  /**
   * Start auto-save timer
   */
  startAutoSave() {
    this.stopAutoSave(); // Clear any existing interval

    this.state.autoSaveInterval = setInterval(() => {
      this.performAutoSave();
    }, this.config.autoSaveInterval);
  },

  /**
   * Stop auto-save timer
   */
  stopAutoSave() {
    if (this.state.autoSaveInterval) {
      clearInterval(this.state.autoSaveInterval);
      this.state.autoSaveInterval = null;
    }
  },

  /**
   * Perform auto-save if content has changed
   */
  performAutoSave() {
    if (!this.state.editor || this.state.isDestroyed) return;

    const content = this.serializeContent();
    const text = this.state.editor.getText().trim();

    if (text && content !== this.state.lastSavedContent) {
      this.pushEvent("auto_save", { content });
      console.log("Auto-saved content");
    }
  },

  /**
   * Update auto-save status display
   */
  updateAutoSaveStatus() {
    if (this.elements.autoSaveStatus) {
      this.elements.autoSaveStatus.textContent = this.state.autoSaveEnabled
        ? "ON"
        : "OFF";
      this.elements.autoSaveStatus.className = this.state.autoSaveEnabled
        ? "text-green-600"
        : "text-gray-500";
    }
  },

  /**
   * Update save button state
   */
  updateSaveButtonState(hasChanges) {
    if (!this.elements.saveButton) return;

    this.elements.saveButton.disabled = !hasChanges;

    if (hasChanges) {
      this.elements.saveButton.classList.remove("opacity-70");
    } else {
      this.elements.saveButton.classList.add("opacity-70");
    }
  },

  /**
   * Handle successful save response
   */
  handleContentSaved() {
    console.log("Content saved successfully");
    this.state.lastSavedContent = this.serializeContent();
    this.updateSaveButtonState(false);
    this.showMessage("success", "Content saved successfully!");
  },

  /**
   * Handle save error response
   */
  handleSaveError(error) {
    console.error("Save error:", error);
    this.showMessage("error", "Failed to save content");
  },

  /**
   * Show flash message
   */
  showMessage(type, message) {
    this.pushEvent("show_flash", { type, message });
  },

  /**
   * Serialize editor content to JSON
   */
  serializeContent() {
    return this.state.editor
      ? JSON.stringify(this.state.editor.getContents())
      : "";
  },

  /**
   * Get current text content
   */
  getCurrentText() {
    return this.state.editor ? this.state.editor.getText() : "";
  },

  /**
   * Set content programmatically
   */
  setContent(content) {
    if (!this.state.editor) return;

    try {
      const delta = JSON.parse(content);
      this.state.editor.setContents(delta);
    } catch (error) {
      this.state.editor.root.innerHTML = content;
    }
  },

  /**
   * Clear all content
   */
  clearContent() {
    if (this.state.editor) {
      this.state.editor.setText("");
    }
  },

  /**
   * Insert text at current cursor position
   */
  insertText(text) {
    if (!this.state.editor) return;

    const range = this.state.editor.getSelection(true);
    this.state.editor.insertText(range.index, text);
  },

  /**
   * Format selected text
   */
  formatText(format, value) {
    if (!this.state.editor) return;

    const range = this.state.editor.getSelection(true);
    if (range && range.length > 0) {
      this.state.editor.formatText(range.index, range.length, format, value);
    }
  },

  /**
   * Cleanup resources
   */
  cleanup() {
    this.state.isDestroyed = true;
    this.stopAutoSave();

    // Clear all references
    this.state.editor = null;
    this.elements = {};

    console.log("Quill editor cleanup completed");
  },
};
