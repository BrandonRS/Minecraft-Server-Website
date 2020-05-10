const GOOD = 200, BAD = 400;

$(function() {
    $("form").ajaxForm({
        beforeSend: function() {
            $("#startServerForm").find("input").prop('disabled', true);
            $("#uploadProgress").css('width', '0%');
            $('#uploadProgress').text('0%');
        },
        uploadProgress: function(e, position, total, complete) {
            $("#uploadProgress").css('width', complete + '%');
            $('#uploadProgress').text(complete + "%");
        },
        success: function(res) {
            $("#startServerForm").find("input").prop('disabled', false);
            if (res.status == GOOD) {
                showSuccess("Server successfully started!");
                getServerStatus();
            } else {
                showError("Failed to start server: " + res.message);
            }
        }
    });
    getServerStatus();
    getProperties('1.15.2');
});

function showSuccess(text) {
    new Noty({
        type: 'success',
        timeout: 4000,
        text: text
    }).show();
}

function showError(text) {
    new Noty({
        type: 'error',
        timeout: 4000,
        text: text
    }).show();
}

$("#startServer").click(function() {
    $("#serverControl").find().prop("disabled", true);
    $.post("/start")
    .done(function(res) {
        $("#serverControl").find().prop("disabled", false);
        if (res.status == GOOD) {
            showSuccess("Server successfully started!");
            $("#statusText").text("Server is up!");
        }
        else
            showError("Failed to start server: " + res.message);
    });
});

$("#stopServer").click(function() {
    $("#serverControl").find().prop("disabled", true);
    $.post("/stop")
    .done(function(res) {
        $("#serverControl").find().prop("disabled", false);
        if (res.status == GOOD) {
            showSuccess("Server successfully stopped!");
            $("#statusText").text("Server is down!");
        }
        else
            showError("Failed to stop server: " + res.message);
    });
});

function getServerStatus() {
    $("#serverControl").find().prop("disabled", true);
    $.get('/status')
    .done(function(res) {
        $("#serverControl").find().prop("disabled", false);
        if (res.status == GOOD) {
            $("#statusText").text("Server is " + res.result + "!");
        }
    });
}

function getProperties(version) {
    $.get('/properties', {'version': version})
    .done(function(res) {
        if (res.status == GOOD) {
            showSuccess("Successfully grabbed properties");
            Object.keys(res.properties).forEach(k => {
                var row = $('<tr>');
                row.append($('<th>').text(k));
                row.append($('<td>').text(res.properties[k] == null ? 'null' : res.properties[k]));
                $('#tableProp').append(row);
            });
        }
        else
            showError("Failed to grab properties: " + res.message);
    });
}

$("#checkStatus").click(function() {
    getServerStatus();
});