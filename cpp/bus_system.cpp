#include <iostream>
#include <fstream>
#include <sstream>
#include <vector>
#include <string>
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <cstdio>
#include <iomanip>

using namespace std;

// ==============================
// DATA STRUCTURES
// ==============================

struct BusStop {
    string name;
    double lat = 0.0;
    double lng = 0.0;
    string time;
};

struct BusRoute {
    string number;
    string name;
    string startLocation;
    string destination;
    string morningTime;
    string returnTime;
    int capacity = 0;
    string driverName;
    string driverPhone;
    vector<BusStop> stops;
};

// Global database file
string dbFilePath = "data/buses.txt";

// ==============================
// FUNCTION PROTOTYPES
// ==============================

string trim(string s);
string toLower(string s);
string escapeJson(string s);

bool parseLine(string line, BusRoute &route);

vector<BusRoute> loadAllBuses();

vector<BusRoute> searchByBus(string searchTerm);
vector<BusRoute> searchByPoint(string pointName);

string formatCoord(double value);
string formatRoute(const BusRoute &route);
string checkRecord(string rawRecord, BusRoute &out);
bool saveAllBuses(const vector<BusRoute> &buses);

// Mutating operations. On failure they fill `code` + `message`.
bool addBus(string rawRecord, string &code, string &message);
bool updateBus(string oldNumber, string rawRecord, string &code, string &message);
bool deleteBus(string busNumber, string &code, string &message);

string toJson(
    vector<BusRoute> buses,
    bool success = true,
    string message = ""
);

string getPointsJson();

// ==============================
// TRIM WHITESPACE
// ==============================

string trim(string s)
{
    int start = 0;

    while (start < s.length() &&
           isspace((unsigned char)s[start]))
    {
        start++;
    }

    int end = s.length() - 1;

    while (end >= start &&
           isspace((unsigned char)s[end]))
    {
        end--;
    }

    if (start > end)
        return "";

    return s.substr(start, end - start + 1);
}

// ==============================
// CONVERT STRING TO LOWERCASE
// ==============================

string toLower(string s)
{
    for (int i = 0; i < s.length(); i++)
    {
        s[i] = tolower((unsigned char)s[i]);
    }

    return s;
}

// ==============================
// ESCAPE JSON STRING
// ==============================

string escapeJson(string s)
{
    string result = "";

    for (char c : s)
    {
        if (c == '"')
            result += "\\\"";

        else if (c == '\\')
            result += "\\\\";

        else if (c == '\b')
            result += "\\b";

        else if (c == '\f')
            result += "\\f";

        else if (c == '\n')
            result += "\\n";

        else if (c == '\r')
            result += "\\r";

        else if (c == '\t')
            result += "\\t";

        else if ((unsigned char)c < 0x20)
        {
            // Any other control character -> \u00XX
            char buf[8];
            snprintf(buf, sizeof(buf), "\\u%04x", (unsigned char)c);
            result += buf;
        }

        else
            result += c;
    }

    return result;
}

// ==============================
// PARSE ONE LINE
// ==============================

bool parseLine(string line, BusRoute &route)
{
    if (line.empty())
        return false;

    if (line[0] == '#')
        return false;

    stringstream ss(line);

    string token;

    vector<string> parts;

    // Split route using |
    while (getline(ss, token, '|'))
    {
        parts.push_back(trim(token));
    }

    if (parts.size() < 10)
        return false;

    // Route information
    route.number = parts[0];
    route.name = parts[1];
    route.startLocation = parts[2];
    route.destination = parts[3];
    route.morningTime = parts[4];
    route.returnTime = parts[5];

    // Capacity
    try
    {
        route.capacity = stoi(parts[6]);
    }
    catch (...)
    {
        route.capacity = 60;
    }

    route.driverName = parts[7];
    route.driverPhone = parts[8];

    // ==========================
    // PARSE BUS STOPS
    // ==========================

    route.stops.clear();

    stringstream stopsStream(parts[9]);

    string stopToken;

    while (getline(stopsStream, stopToken, ';'))
    {
        stopToken = trim(stopToken);

        if (stopToken.empty())
            continue;

        stringstream stopStream(stopToken);

        string piece;

        vector<string> stopPieces;

        // Split stop using ,
        while (getline(stopStream, piece, ','))
        {
            stopPieces.push_back(trim(piece));
        }

        if (stopPieces.size() > 0)
        {
            BusStop stop;

            stop.name = stopPieces[0];

            if (stopPieces.size() > 1)
            {
                try
                {
                    stop.lat = stod(stopPieces[1]);
                }
                catch (...)
                {
                    stop.lat = 0.0;
                }
            }

            if (stopPieces.size() > 2)
            {
                try
                {
                    stop.lng = stod(stopPieces[2]);
                }
                catch (...)
                {
                    stop.lng = 0.0;
                }
            }

            if (stopPieces.size() > 3)
            {
                stop.time = stopPieces[3];
            }

            route.stops.push_back(stop);
        }
    }

    return true;
}

// ==============================
// LOAD ALL BUSES
// ==============================

vector<BusRoute> loadAllBuses()
{
    vector<BusRoute> buses;

    ifstream file(dbFilePath);

    if (!file.is_open())
    {
        cerr << "Warning: Could not open database file: "
             << dbFilePath << endl;

        return buses;
    }

    string line;

    while (getline(file, line))
    {
        BusRoute route;

        if (parseLine(line, route))
        {
            buses.push_back(route);
        }
    }

    file.close();

    return buses;
}

// ==============================
// SEARCH BUS
// ==============================

vector<BusRoute> searchByBus(string searchTerm)
{
    vector<BusRoute> all = loadAllBuses();

    vector<BusRoute> matches;

    string term = toLower(trim(searchTerm));

    // Remove "bus"
    if (term.rfind("bus", 0) == 0)
    {
        term = trim(term.substr(3));
    }

    // Remove "point"
    else if (term.rfind("point", 0) == 0)
    {
        term = trim(term.substr(5));
    }

    for (int i = 0; i < all.size(); i++)
    {
        string bNum = toLower(all[i].number);
        string bName = toLower(all[i].name);

        bool numberMatch = false;

        // Exact match
        if (bNum == term)
        {
            numberMatch = true;
        }

        // 5 matches 05
        else if (term.length() == 1 &&
                 bNum == "0" + term)
        {
            numberMatch = true;
        }

        // 5 matches 05
        else if (bNum.length() == 2 &&
                 bNum[0] == '0' &&
                 bNum.substr(1) == term)
        {
            numberMatch = true;
        }

        // Partial match
        else if (bNum.find(term) != string::npos)
        {
            numberMatch = true;
        }

        bool nameMatch = false;

        if (bName.find(term) != string::npos)
        {
            nameMatch = true;
        }

        if (numberMatch || nameMatch)
        {
            matches.push_back(all[i]);
        }
    }

    return matches;
}

// ==============================
// SEARCH POINT
// ==============================

vector<BusRoute> searchByPoint(string pointName)
{
    vector<BusRoute> all = loadAllBuses();

    vector<BusRoute> matches;

    string term = toLower(trim(pointName));

    for (int i = 0; i < all.size(); i++)
    {
        bool found = false;

        // Check destination
        string destination =
            toLower(all[i].destination);

        if (destination.find(term) != string::npos)
        {
            found = true;
        }

        // Check bus stops
        if (!found)
        {
            for (int j = 0; j < all[i].stops.size(); j++)
            {
                string stopName =
                    toLower(all[i].stops[j].name);

                if (stopName.find(term) != string::npos)
                {
                    found = true;
                    break;
                }
            }
        }

        if (found)
        {
            matches.push_back(all[i]);
        }
    }

    return matches;
}

// ==============================
// FORMAT HELPERS (writing to file)
// ==============================

// Coordinates are written with up to 6 decimals (~11 cm) and no trailing
// zeros, so values never lose precision when the file is rewritten.
string formatCoord(double value)
{
    ostringstream out;

    out << fixed << setprecision(6) << value;

    string text = out.str();

    if (text.find('.') != string::npos)
    {
        while (!text.empty() && text.back() == '0')
            text.pop_back();

        if (!text.empty() && text.back() == '.')
            text.pop_back();
    }

    return text;
}

string formatRoute(const BusRoute &route)
{
    stringstream line;

    line << route.number << "|"
         << route.name << "|"
         << route.startLocation << "|"
         << route.destination << "|"
         << route.morningTime << "|"
         << route.returnTime << "|"
         << route.capacity << "|"
         << route.driverName << "|"
         << route.driverPhone << "|";

    for (int j = 0; j < (int)route.stops.size(); j++)
    {
        line << route.stops[j].name << ","
             << formatCoord(route.stops[j].lat) << ","
             << formatCoord(route.stops[j].lng) << ","
             << route.stops[j].time;

        if (j + 1 < (int)route.stops.size())
            line << ";";
    }

    return line.str();
}

// ==============================
// STRICT RECORD VALIDATION
// (used for add / update; loading stays tolerant)
// ==============================

// Whole string must be a valid number (stod would accept "25.4abc")
bool parseFullDouble(const string &text, double &value)
{
    if (text.empty())
        return false;

    char *endPtr = nullptr;

    value = strtod(text.c_str(), &endPtr);

    return endPtr != nullptr && *endPtr == '\0';
}

// Returns "" when the record is valid, otherwise a human readable error.
string checkRecord(string rawRecord, BusRoute &out)
{
    string record = trim(rawRecord);

    if (record.empty())
        return "Empty record";

    if (record.find('\n') != string::npos ||
        record.find('\r') != string::npos)
        return "Record must be a single line";

    int pipes = 0;

    for (size_t i = 0; i < record.size(); i++)
    {
        if (record[i] == '|')
            pipes++;
    }

    if (pipes != 9)
        return "Record must have exactly 10 fields separated by '|'";

    if (!parseLine(record, out))
        return "Record could not be parsed";

    if (out.number.empty() || out.name.empty() ||
        out.startLocation.empty() || out.destination.empty())
        return "Bus number, name, start location and destination are required";

    if (out.capacity < 1 || out.capacity > 200)
        return "Capacity must be between 1 and 200";

    if (out.stops.size() < 2)
        return "A route needs at least 2 stops";

    // Re-split the stops column and validate every piece strictly
    string stopsColumn = record.substr(record.rfind('|') + 1);

    stringstream stopsStream(stopsColumn);

    string stopToken;

    int index = 0;

    while (getline(stopsStream, stopToken, ';'))
    {
        stopToken = trim(stopToken);

        if (stopToken.empty())
            continue;

        vector<string> pieces;

        stringstream pieceStream(stopToken);

        string piece;

        while (getline(pieceStream, piece, ','))
            pieces.push_back(trim(piece));

        string label = "Stop " + to_string(index + 1);

        if (pieces.size() != 4)
            return label + " must be Name,Lat,Lng,Time";

        double lat = 0.0, lng = 0.0;

        if (pieces[0].empty())
            return label + " has no name";

        if (!parseFullDouble(pieces[1], lat) ||
            !parseFullDouble(pieces[2], lng))
            return label + " has invalid coordinates";

        if (lat < -90.0 || lat > 90.0 || lng < -180.0 || lng > 180.0)
            return label + " coordinates are out of range";

        if (pieces[3].empty())
            return label + " has no time";

        index++;
    }

    return "";
}

// ==============================
// SAVE ALL BUSES (safe rewrite)
// ==============================

// Writes the whole database to a temp file first, keeps a .bak copy of the
// previous version, then swaps the temp file in. A crash or full disk
// can no longer leave a half-written buses.txt behind.
bool saveAllBuses(const vector<BusRoute> &buses)
{
    string tmpPath = dbFilePath + ".tmp";
    string bakPath = dbFilePath + ".bak";

    // 1) backup current file
    {
        ifstream src(dbFilePath, ios::binary);

        if (src.is_open())
        {
            ofstream dst(bakPath, ios::binary | ios::trunc);

            if (dst.is_open())
                dst << src.rdbuf();
        }
    }

    // 2) write the new content to the temp file
    {
        ofstream file(tmpPath, ios::trunc);

        if (!file.is_open())
            return false;

        file << "# ========================================================\n";
        file << "# MUET BUS & ROUTE MANAGEMENT SYSTEM - LOCAL DATABASE\n";
        file << "# Mehran University of Engineering & Technology, Jamshoro\n";
        file << "# ========================================================\n";

        for (size_t i = 0; i < buses.size(); i++)
            file << formatRoute(buses[i]) << "\n";

        file.flush();

        if (!file.good())
        {
            file.close();
            remove(tmpPath.c_str());
            return false;
        }
    }

    // 3) swap temp file into place
    if (rename(tmpPath.c_str(), dbFilePath.c_str()) != 0)
    {
        // Windows cannot rename over an existing file
        remove(dbFilePath.c_str());

        if (rename(tmpPath.c_str(), dbFilePath.c_str()) != 0)
        {
            remove(tmpPath.c_str());
            return false;
        }
    }

    return true;
}

// ==============================
// ADD BUS
// ==============================

bool addBus(string rawRecord, string &code, string &message)
{
    BusRoute route;

    string problem = checkRecord(rawRecord, route);

    if (!problem.empty())
    {
        code = "VALIDATION";
        message = problem;
        return false;
    }

    vector<BusRoute> all = loadAllBuses();

    for (size_t i = 0; i < all.size(); i++)
    {
        if (toLower(all[i].number) == toLower(route.number))
        {
            code = "DUPLICATE";
            message = "Bus number " + route.number + " already exists";
            return false;
        }
    }

    all.push_back(route);

    if (!saveAllBuses(all))
    {
        code = "IO_ERROR";
        message = "Failed to write to file";
        return false;
    }

    code = "OK";
    message = "Bus added to local file database successfully";
    return true;
}

// ==============================
// UPDATE BUS
// ==============================

bool updateBus(string oldNumber, string rawRecord, string &code, string &message)
{
    BusRoute route;

    string problem = checkRecord(rawRecord, route);

    if (!problem.empty())
    {
        code = "VALIDATION";
        message = problem;
        return false;
    }

    vector<BusRoute> all = loadAllBuses();

    int target = -1;

    for (size_t i = 0; i < all.size(); i++)
    {
        if (all[i].number == oldNumber)
            target = (int)i;
    }

    if (target < 0)
    {
        code = "NOT_FOUND";
        message = "Bus number not found";
        return false;
    }

    // The number may be changed, but not to one used by another bus
    for (size_t i = 0; i < all.size(); i++)
    {
        if ((int)i != target &&
            toLower(all[i].number) == toLower(route.number))
        {
            code = "DUPLICATE";
            message = "Bus number " + route.number + " already exists";
            return false;
        }
    }

    all[target] = route;

    if (!saveAllBuses(all))
    {
        code = "IO_ERROR";
        message = "Failed to write to file";
        return false;
    }

    code = "OK";
    message = "Bus updated in local file database";
    return true;
}

// ==============================
// DELETE BUS
// ==============================

bool deleteBus(string busNumber, string &code, string &message)
{
    vector<BusRoute> all = loadAllBuses();

    vector<BusRoute> kept;

    bool deleted = false;

    for (size_t i = 0; i < all.size(); i++)
    {
        if (all[i].number == busNumber)
        {
            deleted = true;
            continue;
        }

        kept.push_back(all[i]);
    }

    if (!deleted)
    {
        code = "NOT_FOUND";
        message = "Bus number not found";
        return false;
    }

    if (!saveAllBuses(kept))
    {
        code = "IO_ERROR";
        message = "Failed to write to file";
        return false;
    }

    code = "OK";
    message = "Bus deleted from local file database";
    return true;
}

// ==============================
// CONVERT BUSES TO JSON
// ==============================

string toJson(
    vector<BusRoute> buses,
    bool success,
    string message)
{
    stringstream json;

    json << "{\n";

    json << "  \"success\": "
         << (success ? "true" : "false")
         << ",\n";

    json << "  \"message\": \""
         << escapeJson(message)
         << "\",\n";

    json << "  \"count\": "
         << buses.size()
         << ",\n";

    json << "  \"engine\": "
         << "\"C++ File-Handling Engine "
         << "(std::ifstream/ofstream)\",\n";

    json << "  \"buses\": [\n";

    for (int i = 0; i < buses.size(); i++)
    {
        BusRoute b = buses[i];

        json << "    {\n";

        json << "      \"number\": \""
             << escapeJson(b.number)
             << "\",\n";

        json << "      \"name\": \""
             << escapeJson(b.name)
             << "\",\n";

        json << "      \"startLocation\": \""
             << escapeJson(b.startLocation)
             << "\",\n";

        json << "      \"destination\": \""
             << escapeJson(b.destination)
             << "\",\n";

        json << "      \"morningTime\": \""
             << escapeJson(b.morningTime)
             << "\",\n";

        json << "      \"returnTime\": \""
             << escapeJson(b.returnTime)
             << "\",\n";

        json << "      \"capacity\": "
             << b.capacity
             << ",\n";

        json << "      \"driverName\": \""
             << escapeJson(b.driverName)
             << "\",\n";

        json << "      \"driverPhone\": \""
             << escapeJson(b.driverPhone)
             << "\",\n";

        json << "      \"stops\": [\n";

        for (int j = 0; j < b.stops.size(); j++)
        {
            BusStop s = b.stops[j];

            json << "        {\n";

            json << "          \"sequence\": "
                 << j + 1
                 << ",\n";

            json << "          \"name\": \""
                 << escapeJson(s.name)
                 << "\",\n";

            json << "          \"lat\": "
                 << formatCoord(s.lat)
                 << ",\n";

            json << "          \"lng\": "
                 << formatCoord(s.lng)
                 << ",\n";

            json << "          \"time\": \""
                 << escapeJson(s.time)
                 << "\"\n";

            json << "        }";

            if (j + 1 < b.stops.size())
            {
                json << ",";
            }

            json << "\n";
        }

        json << "      ]\n";

        json << "    }";

        if (i + 1 < buses.size())
        {
            json << ",";
        }

        json << "\n";
    }

    json << "  ]\n";

    json << "}\n";

    return json.str();
}

// ==============================
// GET ALL UNIQUE POINTS
// ==============================

string getPointsJson()
{
    vector<BusRoute> buses = loadAllBuses();

    vector<string> points;

    stringstream json;

    json << "{\n";

    json << "  \"success\": true,\n";

    json << "  \"points\": [\n";

    bool first = true;

    for (int i = 0; i < buses.size(); i++)
    {
        for (int j = 0; j < buses[i].stops.size(); j++)
        {
            string stopName =
                buses[i].stops[j].name;

            // Check if point already exists
            bool alreadyExists = false;

            for (int k = 0; k < points.size(); k++)
            {
                if (points[k] == stopName)
                {
                    alreadyExists = true;
                    break;
                }
            }

            if (!alreadyExists)
            {
                points.push_back(stopName);

                if (!first)
                {
                    json << ",\n";
                }

                json << "    {";

                json << "\"name\": \""
                     << escapeJson(stopName)
                     << "\", ";

                json << "\"lat\": "
                     << formatCoord(buses[i].stops[j].lat)
                     << ", ";

                json << "\"lng\": "
                     << formatCoord(buses[i].stops[j].lng)
                     << ", ";

                json << "\"busNumber\": \""
                     << escapeJson(buses[i].number)
                     << "\"";

                json << "}";

                first = false;
            }
        }
    }

    json << "\n";

    json << "  ]\n";

    json << "}\n";

    return json.str();
}

// ==============================
// MAIN FUNCTION
// ==============================

int main(int argc, char* argv[])
{
    // Default database
    dbFilePath = "data/buses.txt";

    // Check environment variable
    const char* envDb =
        getenv("BUS_DB_FILE");

    if (envDb)
    {
        dbFilePath = envDb;
    }

    string action = "list";
    string query = "";
    string data = "";

    // ==========================
    // READ COMMAND LINE ARGUMENTS
    // ==========================

    for (int i = 1; i < argc; i++)
    {
        string arg = argv[i];

        if ((arg == "--action" || arg == "-a") &&
            i + 1 < argc)
        {
            action = argv[++i];
        }

        else if ((arg == "--query" || arg == "-q") &&
                 i + 1 < argc)
        {
            query = argv[++i];
        }

        else if ((arg == "--data" || arg == "-d") &&
                 i + 1 < argc)
        {
            data = argv[++i];
        }

        else if (arg == "--db" &&
                 i + 1 < argc)
        {
            dbFilePath = argv[++i];
        }
    }

    // ==========================
    // LIST
    // ==========================

    if (action == "list")
    {
        vector<BusRoute> buses =
            loadAllBuses();

        cout << toJson(
            buses,
            true,
            "Retrieved all bus routes from file database"
        );
    }

    // ==========================
    // SEARCH BUS
    // ==========================

    else if (action == "search_bus")
    {
        vector<BusRoute> results =
            searchByBus(query);

        string message;

        if (results.empty())
        {
            message =
                "No bus found matching '" +
                query + "'";
        }
        else
        {
            message =
                "Matching bus routes found";
        }

        cout << toJson(
            results,
            !results.empty(),
            message
        );
    }

    // ==========================
    // SEARCH POINT
    // ==========================

    else if (action == "search_point")
    {
        vector<BusRoute> results =
            searchByPoint(query);

        string message;

        if (results.empty())
        {
            message =
                "No routes pass through '" +
                query + "'";
        }
        else
        {
            message =
                "Buses servicing point found";
        }

        cout << toJson(
            results,
            !results.empty(),
            message
        );
    }

    // ==========================
    // GET POINTS
    // ==========================

    else if (action == "get_points")
    {
        cout << getPointsJson();
    }

    // ==========================
    // ADD / UPDATE / DELETE
    // ==========================

    else if (action == "add_bus" ||
             action == "update_bus" ||
             action == "delete_bus")
    {
        string code, message;

        bool ok = false;

        if (action == "add_bus")
        {
            if (data.empty())
            {
                code = "VALIDATION";
                message = "Missing --data argument";
            }
            else
            {
                ok = addBus(data, code, message);
            }
        }

        else if (action == "update_bus")
        {
            if (query.empty() || data.empty())
            {
                code = "VALIDATION";
                message = "update_bus needs --query <bus number> and --data <record>";
            }
            else
            {
                ok = updateBus(query, data, code, message);
            }
        }

        else
        {
            if (query.empty())
            {
                code = "VALIDATION";
                message = "Missing --query bus number";
            }
            else
            {
                ok = deleteBus(query, code, message);
            }
        }

        cout << "{"
             << "\"success\": " << (ok ? "true" : "false") << ", "
             << "\"code\": \"" << escapeJson(code) << "\", "
             << "\"message\": \"" << escapeJson(message) << "\""
             << "}\n";

        return ok ? 0 : 1;
    }

    // ==========================
    // UNKNOWN ACTION
    // ==========================

    else
    {
        cout << "{";

        cout << "\"success\": false, ";

        cout << "\"message\": \"Unknown action: "
             << escapeJson(action)
             << "\"";

        cout << "}\n";

        return 1;
    }

    return 0;
}
