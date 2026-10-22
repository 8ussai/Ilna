#include <algorithm>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

struct Node {
    char kind;
    std::string text;
    std::vector<Node> items;
    std::vector<std::pair<std::string, Node>> keys;
};

std::string src;
size_t pos = 0;

void skipSpace() 
{
    while (pos < src.size() && isspace((unsigned char)src[pos])) 
    {
        pos++;
    }
}

std::string readString() 
{
    size_t start = ++pos;
    while (src[pos] != '"') 
    {
        pos += (src[pos] == '\\') ? 2 : 1;
    }
    return src.substr(start, pos++ - start);
}

Node read() 
{
    skipSpace();
    Node n;
    if (src[pos] == '"') 
    {
        n.kind = 's';
        n.text = readString();
        return n;
    }
    n.kind = (src[pos] == '{') ? 'o' : 'a';
    char close = (n.kind == 'o') ? '}' : ']';
    pos++;
    skipSpace();
    while (src[pos] != close) 
    {
        if (n.kind == 'o') 
        {
            skipSpace();
            std::string key = readString();
            skipSpace();
            pos++;
            n.keys.push_back({key, read()});
        } 
        else 
        {
            n.items.push_back(read());
        }
        skipSpace();
        if (src[pos] == ',') 
        {
            pos++;
        }
        skipSpace();
    }
    pos++;
    return n;
}

void write(std::ostream& out, const Node& n, int depth) 
{
    std::string pad(depth * 2 + 2, ' '), endPad(depth * 2, ' ');
    if (n.kind == 's') 
    { 
        out << '"' << n.text << '"'; 
        return;
    }
    bool isObj = (n.kind == 'o');
    size_t count = isObj ? n.keys.size() : n.items.size();
    if (count == 0) 
    { 
        out << (isObj ? "{}" : "[]");
        return;
    }
    out << (isObj ? "{\n" : "[\n");
    for (size_t i = 0; i < count; i++) 
    {
        out << pad;
        if (isObj) 
        {
            out << '"' << n.keys[i].first << "\": ";
        }
        write(out, isObj ? n.keys[i].second : n.items[i], depth + 1);
        out << (i + 1 < count ? ",\n" : "\n");
    }
    out << endPad << (isObj ? '}' : ']');
}

std::string nameAr(const Node& n) 
{
    for (auto& k : n.keys)
    {
        if (k.first == "name_ar")
        {
            return k.second.text;
        }
    }
    return "";
}

std::string sortKey(std::string s) 
{
    if (s.rfind("ال", 0) == 0) 
    {
        s.erase(0, std::string("ال").size());
    }

    const std::pair<std::string, std::string> fold[] = {
        {"أ", "ا"}, {"إ", "ا"}, {"آ", "ا"}, {"ٱ", "ا"},
        {"ة", "ه"}, {"ى", "ي"}, {"ئ", "ي"}, {"ؤ", "و"},
    };
    for (auto& f : fold)
    {
        for (size_t at; (at = s.find(f.first)) != std::string::npos;)
        {
            s.replace(at, f.first.size(), f.second);
        }
    }

    std::string out;
    for (size_t i = 0; i < s.size(); i++) 
    {
        unsigned char a = s[i], b = (i + 1 < s.size()) ? s[i + 1] : 0;
        if (a == 0xD9 && ((b >= 0x8B && b <= 0x9F) || b == 0xB0 || b == 0x80)) 
        { 
            i++;
            continue;
        }
        out += s[i];
    }
    return out;
}

void sortAll(Node& n) {
    for (auto& k : n.keys) 
    {
        sortAll(k.second);
    }
    for (auto& item : n.items) 
    {
        sortAll(item);
    }
    if (n.kind == 'a' && !n.items.empty() && !nameAr(n.items[0]).empty())
    {
        std::stable_sort(n.items.begin(), n.items.end(), [](const Node& x, const Node& y) 
        {
            return sortKey(nameAr(x)) < sortKey(nameAr(y));
        });
    }
}

int main() {
    std::ifstream in("universities.json", std::ios::binary);
    if (!in) 
    { 
        std::cerr << "Run this from backend/data\n";
        return 1;
    }
    std::stringstream buf;
    buf << in.rdbuf();
    src = buf.str();
    in.close();

    Node root = read();
    sortAll(root);

    std::ofstream out("universities.json", std::ios::binary);
    write(out, root, 0);
    std::cout << "Sorted universities.json\n";
}