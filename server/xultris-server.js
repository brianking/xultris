PORT = 7000;
HOST = "localhost";
SESSION_TIMEOUT = 60 * 1000;
VERSION = "2.0";
PROTOCOL = "2.0";

var tcp = require("./tcp");
var sys = require("./sys");

var sessions = {};

var server = tcp.createServer(function (socket)
{
    socket.setEncoding("utf8");

    socket.addListener("connect", function ()
    {
        sys.puts("[xultris-server] " + (new Date()) + ": new connection from " + socket.remoteAddress);

        //socket.setEncoding("ascii");

        var session = {
            nick: "",
         
            id: Math.floor(Math.random()*9999).toString(),
         
            timestamp: new Date(),

            opponent: null,

            socket: null,
         
            poke: function ()
            {
               session.timestamp = new Date();
            },

            destroy: function ()
            {
                if (!sessions[session.id])
                    return;

                sys.puts("destroying a session");

                try
                {
                    sessions[session.id].socket.close();
                    sessions[session.id].socket = null;
                } catch (e) {}

                if (sessions[session.id].opponent)
                {
                    try
                    {
                        sessions[session.id].opponent.socket.close();
                        sessions[session.id].opponent.socket = null
                    } catch (e) {}

                    delete sessions[sessions[session.id].opponent.id];
                }

                delete sessions[session.id];
            }
        };
        
        session.nick = "Player " + session.id;

        sessions[session.id] = session;
        //socket.send("Welcome to Xultris Server v" + VERSION + "\r\n");

        socket.session = session;
        session.socket = socket;
    });

    socket.addListener("receive", function (data)
    {
        try
        {
            socket.session.poke();

            var cs = data.indexOf(" ");

            if (cs > 0)
            {
                var command = data.substring(0,cs);
                var payload = data.substring(cs+1,data.length-2);

                sys.puts("received '" + command + "' command with payload '" + payload + "'");

                if (command == "nick")
                {
                    var nick = payload.replace(/[^\w ]/g, "", "g").substring(0, 32);

                    if (nick != "")
                    {
                        socket.session.nick = nick;
                    }

                    socket.send("nick " + socket.session.nick + "\r\n");
                }
                else if (command == "protocol")
                {
                    socket.send("protocol " + PROTOCOL + "\r\n");

                    if (payload != PROTOCOL)
                    {
                        socket.session.destroy();
                        socket.close();
                    }
                }
                else if (command == "play")
                {
                    socket.session.opponent = null;

                    for (var id in sessions)
                    {
                        if (!sessions.hasOwnProperty(id)) continue;
                        var asession = sessions[id];

                        if (id == payload)
                        {
                            socket.session.opponent = asession;
                            socket.session.opponent.opponent = socket.session;
                            break;
                        }
                    }

                    if (socket.session.opponent)
                    {
                        socket.send("playing " + socket.session.opponent.nick + "\r\n");
                        socket.session.opponent.socket.send("playing " + socket.session.nick + "\r\n");
                    }
                    else
                    {
                        socket.send("error opponent '" + payload + "' not found\r\n");
                    }
                }
                else if (command == "send")
                {
                    if (socket.session.opponent && socket.session.opponent.socket)
                    {
                        // TODO max size of payload here
                        socket.session.opponent.socket.send("send " + payload + "\r\n");
                        //socket.send("ok\r\n");
                    }
                    else
                    {
                        socket.send("error opponent not found\r\n");
                    }
                }
                else if (command == "sync")
                {
                    if (socket.session.opponent && socket.session.opponent.socket)
                    {
                        // TODO max size of payload here
                        try
                        {
                            socket.session.opponent.socket.send("sync " + payload + "\r\n");
                        } catch (e)
                        {
                            sys.puts("got exception while syncing with opponent, will kill game.");
                            socket.session.destroy();
                            socket.session.opponent.destroy();
                        }
                        //socket.send("ok\r\n");
                    }
                    else
                    {
                        socket.send("error opponent not found\r\n");
                    }
                }
                else
                {
                    socket.send("error opponent not found\r\n");
                }
            }
            else
            {
                var command = data.substring(0,data.length-2);

                var mc = command.split(/\r\n/);
                if (mc.length>1)
                command = mc[0];

                sys.puts("received '" + command + "' command");

                if (command == "ping")
                {
                    socket.send("pong\r\n");
                }
                else if (command == "pause")
                {
                    if (socket.session.opponent && socket.session.opponent.socket)
                    {
                        socket.session.opponent.socket.send("pause\r\n");
                    }
                }
                else if (command == "unpause")
                {
                    if (socket.session.opponent && socket.session.opponent.socket)
                    {
                        socket.session.opponent.socket.send("unpause\r\n");
                    }
                }
                else if (command == "iwin")
                {
                    socket.send("goodbye\r\n");

                    if (socket.session.opponent && socket.session.opponent.socket)
                    {
                        socket.session.opponent.socket.send("youlose\r\n");
                    }

                    socket.session.destroy();
                    socket.close();
                }
                else if (command == "ilose")
                {
                    socket.send("goodbye\r\n");

                    if (socket.session.opponent && socket.session.opponent.socket)
                    {
                        socket.session.opponent.socket.send("youwin\r\n");
                    }

                    socket.session.destroy();
                    socket.close();
                }
                else if (command == "quit")
                {
                    socket.send("goodbye\r\n");

                    if (socket.session.opponent && socket.session.opponent.socket)
                    {
                        socket.session.opponent.socket.send("youwin\r\n");
                    }

                    socket.session.destroy();
                    socket.close();
                }
                else if (command == "list")
                {
                    var payload = "list ";

                    for (var id in sessions)
                    {
                        if (!sessions.hasOwnProperty(id)) continue;
                        var asession = sessions[id];

                        if (id != socket.session.id && !asession.opponent)
                        {
                            payload += asession.id + "=" + asession.nick + "|";
                        }
                    }

                    socket.send(payload + "\r\n");
                }
                else
                {
                    socket.send("error unknown command '" + command + "'\r\n");
                }
            }
        }
        catch (e)
        {
            sys.puts("[xultris-server] caught exception: '" + e + "'");
        }
    });

    socket.addListener("eof", function ()
    {
        socket.session.destroy();
        socket.close();
    });
});

server.listen(PORT, HOST);
sys.puts("[xultris-server] " + (new Date()) + ": new server started on " + HOST + ":" + PORT);

setInterval(function ()
{
    var now = new Date();
    var sessioncount=0;

    for (var id in sessions)
    {
        if (!sessions.hasOwnProperty(id)) continue;
        var session = sessions[id];

        if (now - session.timestamp > SESSION_TIMEOUT)
        {
            session.destroy();
        }
        else
        {
            sessioncount++;
        }
    }

    sys.puts("[xultris-server] " + (new Date()) + ": have " + sessioncount + " active sessions");
}, 1000);

