defmodule EditorWeb.Api.UploadController do
  use EditorWeb, :controller

  def upload_image(conn, %{"file" => file}) do
    case handle_image_upload(file) do
      {:ok, url} ->
        json(conn, %{
          success: 1,
          file: %{
            url: url,
            alt: "",
            caption: ""
          }
        })

      {:error, reason} ->
        conn
        |> put_status(:bad_request)
        |> json(%{
          success: 0,
          error: reason
        })
    end
  end

  def upload_image(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{
      success: 0,
      error: "No file provided"
    })
  end

  defp handle_image_upload(file) do
    # Validate file type
    case validate_image_file(file) do
      :ok ->
        # Generate unique filename
        _ext = Path.extname(file.filename)
        filename = "#{System.system_time(:millisecond)}_#{file.filename}"

        # Create destination path
        uploads_dir = Path.join([Application.app_dir(:editor, "priv/static/uploads")])
        File.mkdir_p!(uploads_dir)
        dest_path = Path.join(uploads_dir, filename)

        # Copy uploaded file to destination
        case File.cp(file.path, dest_path) do
          :ok ->
            {:ok, "/uploads/#{filename}"}

          {:error, reason} ->
            {:error, "Failed to save file: #{reason}"}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp validate_image_file(%Plug.Upload{} = file) do
    # Check file size (10MB limit)
    max_size = 10 * 1024 * 1024

    # Get file size from the uploaded file
    file_size =
      case File.stat(file.path) do
        {:ok, stat} -> stat.size
        _ -> 0
      end

    if file_size > max_size do
      {:error, "File size exceeds 10MB limit"}
    else
      # Check file type by extension
      allowed_extensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]
      ext = Path.extname(file.filename) |> String.downcase()

      if ext in allowed_extensions do
        :ok
      else
        {:error, "Invalid file type. Only images are allowed."}
      end
    end
  end
end
