var app = require('http').createServer(serverHandler),
	util = require('util'),
	sys = require('sys'),
	io = require('socket.io').listen(app);

app.listen(8080);

function serverHandler(req, res) {
	sys.puts('ok');
}

var turn = 0;
var grid = new Array();
var p = 3;
var currentTeam = 1;
var playersList = new Array();
var clients = [];
var games = [];

for (var i = 0; i < p*p; i++)
{
	grid.push(0);
}

var winningComb = [	[0,1,2],
					[3,4,5],
					[6,7,8],
					[0,3,6],
					[1,4,7],
					[2,5,8],
					[0,4,8],
					[2,4,6] ];
	
var init = function()
{
	turn = 0;
	currentTeam = 1;
	grid = new Array();
	p = 3;

	for (i = 0; i < p*p; i++)
		grid.push(0);
};

//socket.on('validation', validation);

io.sockets.on('connection', function (socket) {
	
	socket.emit('connection', {state:true});
	
	
	socket.on('disconnect', function() {
		
		
		sys.puts('client disconnected');
		var game = getGameByPlayerId(socket.id);
		if (game)
		{
			game.cancel(socket.id);
			removeGame(game);
		}
		
		removePlayerById(socket.id);
		
		mybroadcast(socket, 'updatePlayersCount',{players:playersList});
	});
		
	socket.on('playerChoice', function(data) {
	
		var game = getGameByPlayerId(data.id);
		
		if (!game)
		{
			socket.emit('wrongGame');
			return;
		}
		
		if (!game.play(data.id, data.pos))
		{
			socket.emit('wrong player');
			return;
		}
		
		io.sockets.socket(game.players[0]).emit('playResponse', {state:true, team:(game.turn)%2, pos:data.pos,playerTurn:getPlayerById(game.players[(game.turn)%2]).nickname});
		io.sockets.socket(game.players[1]).emit('playResponse', {state:true, team:(game.turn)%2, pos:data.pos,playerTurn:getPlayerById(game.players[(game.turn)%2]).nickname});
		
		var win = game.checkIfWin();
		
		if (win)
		{
			if (win == game.players[0])
			{
				io.sockets.socket(game.players[0]).emit('win', {me:true});
				io.sockets.socket(game.players[1]).emit('win', {me:false, winner:getPlayerById(game.players[0]).nickname});
			}
			else if (win == game.players[1])
			{
				io.sockets.socket(game.players[1]).emit('win', {me:true});
				io.sockets.socket(game.players[0]).emit('win', {me:false, winner:getPlayerById(game.players[1]).nickname});
			}
			io.sockets.socket(game.players[0]).emit('endGame');
			io.sockets.socket(game.players[1]).emit('endGame');
			removeGame(game);
		}
	});
	
	socket.on('registerPlayer', function(data) {
		
		for (var i = 0; i < playersList.length; i++)
			if (playersList[i].id == data.id)
			{
				socket.emit('alreadyHere');
				return;
			}
			else if (playersList[i].nickname == data.nickname)
			{
				socket.emit('alreadyRegistered');
				return;
			}
		
		var newPlayer = new Player(data.id, data.nickname);
		
		playersList.push(newPlayer);
		
		var newClient = {};
		newClient.id = data.id;
		newClient._conn = socket;
		clients.push(newClient);
		
		mybroadcast(socket, 'updatePlayersCount',{players:playersList});
	});	
	
	socket.on('invitePlayer', function(data) {
	
		var player = getPlayerById(socket.id);
		
		if (!player) 
		{	
			socket.emit('notRegistered');
			return;
		}
		
		var _client = getClientById(data.id);
		
		if (!_client)
		{
			socket.emit('wrongInviteId');
			return;
		}
		
		if (getGameByPlayerId(data.id))
		{
			socket.emit('alreadyPlaying', {name:getPlayerById(data.id).nickname});
			return;
		}
		
		if (socket.id == data.id)
		{
			socket.emit('yourself');
			return;
		}
		
		_client.emit('invitation', {id:socket.id, name:player.nickname});
		player.addPlayerToWaitingQueue(data.id);
	});
	
	socket.on('accept', function(data) {
		
		var player1 = getPlayerById(data.player1);
		
		if (!player1)
		{
			socket.emit('wrongInviteId');
			return false;
		}
		
		if (!player1.isInQueue(data.player2))
		{
			socket.emit('wrongInviteId');
			return false;
		}
		
		player1.removePlayerFromWaitingQueue(data.player2);
		var player2 = getPlayerById(data.player2);
		
		if (!player2)
		{
			socket.emit('wrongInviteId');
			return false;
		}
		
		var newGame = new Game(player1.id, player2.id);
		games.push(newGame);
		player1.state = 1;
		player2.state = 1;
		io.sockets.socket(player1.id).emit('playerIsReady', {state:true, turn:getPlayerById(player1.id).nickname});
		io.sockets.socket(player2.id).emit('playerIsReady', {state:true, turn:getPlayerById(player1.id).nickname});
	});
	
	socket.on('decline', function(data) {
		getPlayerById(data.player1).removePlayerFromWaitingQueue(data.player2);
		io.sockets.socket(data.player1).emit('decline', {from:getPlayerById(data.player2).nickname});
	});
	
});

var mybroadcast = function(socket, message, data)
{
	socket.broadcast.emit(message, data);
	socket.emit(message, data);
};

var removePlayerById = function(id)
{
	var temp = new Array();
	for (var i = 0; i < playersList.length; i++)
		if (playersList[i].id != id)
			temp.push(playersList[i]);
	
	playersList = temp;	
}; 

var removeGame = function(game)
{
	var temp = new Array();
	for (var i = 0; i < games.length; i++)
		if (game.id != games[i].id)
			temp.push(games[i]);
	
	games = temp;
};

var getPlayerById = function (id)
{
	for (var i = 0; i < playersList.length; i++)
		if (playersList[i].id == id)
			return playersList[i];
	return false;
};

var getClientById = function (id)
{
	for (var i = 0; i < clients.length; i++)
		if (clients[i].id == id)
			return clients[i]._conn;
	return false;
};

var getGameByPlayerId = function(id)
{
	for (var i = 0; i < games.length; i++)
		if (games[i].players[0] == id || games[i].players[1] == id)
			return games[i];
	return false;
};

var uniqId = function() {

    var S4 = function ()
    {
        return Math.floor(
                Math.random() * 0x10000 /* 65536 */
            ).toString(16);
    };

    return (
            S4() + S4() + "-" +
            S4() + "-" +
            S4() + "-" +
            S4() + "-" +
            S4() + S4() + S4()
        );
};

/**Player object**/
var Player = function(id, nickname)
{
	this.id = id;
	this.nickname = nickname;
	this.state = 0;
	this.games = {};
	this.waitingQueue = [];
	
	this.addPlayerToWaitingQueue = function(id)
	{
		this.waitingQueue.push(id);
	};
	
	this.removePlayerFromWaitingQueue = function(id)
	{
		var temp = new Array();
		for (var i = 0; i < this.waitingQueue.length; i++)
			if (this.waitingQueue[i] != id)
				temp.push(id);
		this.waitingQueue = temp;
	};
	
	this.changeState = function(newState)
	{
		this.state = newState;
	};
	
	this.isInQueue = function (id)
	{
		for (var i = 0; i < this.waitingQueue.length; i++)
			if (this.waitingQueue[i] == id)
				return true;
		return false;
	};
	
	this.getClient = function()
	{
		for (var i = 0; i < clients.length; i++)
			if (clients[i].id = this.id)
				return clients[i]._conn;
		return false;
	};
};
/**end players functions**/

/**Game object**/
var Game = function(player1, player2) 
{
	this.id = uniqId();
	this.players = [player1, player2];
	this.grid = new Array();
	this.turn = 0;
	this.state = 1;
	for (var i = 0; i < 9; i++)
		this.grid.push(-1);
		
	this.play = function(id, pos)
	{
		sys.puts(turn%2);
		if (this.players.indexOf(id) == this.turn%2)
			if (this.grid[pos] == -1)
			{
				this.grid[pos] = this.turn%2;
				this.turn++;
				sys.puts(sys.inspect(this.grid));
				return true;
			}
			else
				return false;
		else
			return false;
	};
	
	this.checkIfWin = function()
	{
		for (var i = 0; i < winningComb.length; i++)
			if (this.grid[winningComb[i][0]] == (this.turn+1)%2 && this.grid[winningComb[i][1]] == (this.turn+1)%2 && this.grid[winningComb[i][2]] == (this.turn+1)%2)
			{
				this.state = 0;
				return this.players[(this.turn+1)%2];
			}
		return false;
	};
	
	this.cancel = function(leaver)
	{
		var index = (this.players.indexOf(leaver) ? 0 : 1);
		io.sockets.socket(this.players[index]).emit('gameCancelled', {name:getPlayerById(leaver).nickname});
	};
};
/**End game object**/